from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import Sum, Value, DecimalField
from django.db.models.functions import Coalesce
from django.db.models.signals import post_delete, post_save, pre_delete, pre_save
from django.dispatch import receiver

from core.constants import DONE
from apps.warehouse.models import Product, ProductVariant

from ..models import Order, OrderItem

ZERO = Decimal("0")
SOLD_TOTAL = Coalesce(
    Sum("sold_items__count"),
    Value(ZERO, output_field=DecimalField(max_digits=10, decimal_places=3)),
)


def _recalculate_order_total(order_id):
    """Пересчитывает total_prise заказа по его позициям. Через queryset.update(),
    а не instance.save() — если заказ уже удалён (каскад при удалении Order),
    update() по несуществующему pk просто ничего не делает, а save() в этой
    ситуации мог бы заново вставить строку удалённого заказа."""
    total = (
        OrderItem.objects.filter(order_id=order_id).aggregate(
            total=models.Sum("total_prise")
        )["total"]
        or 0
    )
    Order.objects.filter(pk=order_id).update(total_prise=total)


def _stock_target(item):
    """Товар с вариантами (размерами) хранит остаток на самом варианте, а не
    на Product — у него своя цена и свой склад (см. ProductVariant и то же
    решение в apps/production/signals/consumables.py). Без варианта —
    остаток, как обычно, на самом товаре."""
    if item.variant_id:
        return ProductVariant, item.variant_id
    return Product, item.product_id


def _adjust_stock(stock_model, stock_id, delta):
    """delta < 0 — списать со склада (заказ выполнен), delta > 0 — вернуть
    (заказ отменён/возвращён или позиция удалена)."""
    obj = stock_model.objects.select_for_update().get(pk=stock_id)
    new_count = obj.count_in_warehouse + delta
    if new_count < 0:
        raise ValidationError(
            {
                "count": (
                    f"Недостаточно товара «{obj}» на складе "
                    f"(в наличии {obj.count_in_warehouse}, требуется {-delta})."
                )
            }
        )
    stock_model.objects.filter(pk=stock_id).update(count_in_warehouse=new_count)


def _release_production_allocation(order_item_id):
    """Отвязывает продажу от партий производства (см. _allocate_production_batches)
    и возвращает is_sold в False там, где после этого остаток снова не распродан.
    Вызывается ДО фактического удаления/пересчёта позиции заказа, пока
    order_item ещё существует — иначе позиции продажи не найти по order_item_id."""
    from apps.production.models import ProductProduction, ProductProductionSoldItem

    production_ids = list(
        ProductProductionSoldItem.objects.filter(order_item_id=order_item_id)
        .values_list("production_id", flat=True)
        .distinct()
    )
    if not production_ids:
        return

    ProductProductionSoldItem.objects.filter(order_item_id=order_item_id).delete()

    still_sold_ids = (
        ProductProduction.objects.filter(pk__in=production_ids)
        .annotate(sold_total=SOLD_TOTAL)
        .filter(sold_total__gte=models.F("count"))
        .values_list("pk", flat=True)
    )
    ProductProduction.objects.filter(pk__in=production_ids).exclude(
        pk__in=still_sold_ids
    ).update(is_sold=False)


def _allocate_production_batches(order_item):
    """Распределяет проданное количество позиции заказа по партиям
    производства того же товара/варианта — FIFO по сроку годности (сначала
    те, что истекают раньше), чтобы «Производство» корректно показывало
    партию как проданную, а не как «истекает срок» (см. ProductionJournal.jsx).

    Если у товара нет партий производства (или их не хватает на всё
    количество) — это ожидаемо: остаток на складе мог появиться не только
    через производство, продажа всё равно уже списана со склада в
    _adjust_stock, здесь только для отображения в журнале производства.
    """
    from apps.production.models import ProductProduction, ProductProductionSoldItem

    field = "variant_id" if order_item.variant_id else "product_id"
    stock_id = order_item.variant_id or order_item.product_id

    remaining = order_item.count
    batches = (
        ProductProduction.objects.select_for_update()
        .filter(**{field: stock_id}, is_sold=False)
        .annotate(sold_total=SOLD_TOTAL)
        .order_by("best_before_date", "create_dt")
    )

    new_sold_items = []
    newly_sold_ids = []
    for batch in batches:
        if remaining <= 0:
            break
        available = batch.count - batch.sold_total
        if available <= 0:
            continue
        take = min(available, remaining)
        new_sold_items.append(
            ProductProductionSoldItem(
                production=batch, count=take, order_item=order_item
            )
        )
        remaining -= take
        if take >= available:
            newly_sold_ids.append(batch.pk)

    if new_sold_items:
        ProductProductionSoldItem.objects.bulk_create(new_sold_items)
    if newly_sold_ids:
        ProductProduction.objects.filter(pk__in=newly_sold_ids).update(is_sold=True)


def _resync_production_allocation(order_item):
    """Полная пересборка привязки к партиям для позиции: проще и надёжнее,
    чем считать дельту, — снимаем старое распределение и раскладываем заново
    под текущее order_item.count."""
    _release_production_allocation(order_item.pk)
    _allocate_production_batches(order_item)


@receiver(pre_save, sender=Order)
def track_previous_order_status(sender, instance, raw, **kwargs):
    if raw or instance.pk is None:
        instance._previous_status = None
        return
    instance._previous_status = (
        Order.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
    )


@receiver(post_save, sender=Order)
def sync_warehouse_on_order_status_change(sender, instance, created, raw, **kwargs):
    """Списывает товар со склада, когда заказ переходит в DONE, и возвращает
    его обратно, когда заказ уходит из DONE (отмена, возврат и т.п.)."""
    if raw or created:
        return

    previous_status = getattr(instance, "_previous_status", None)
    if previous_status == instance.status:
        return

    with transaction.atomic():
        items = list(OrderItem.objects.filter(order_id=instance.pk))

        if instance.status == DONE and previous_status != DONE:
            for item in items:
                if item.stock_deducted:
                    continue
                _adjust_stock(*_stock_target(item), -item.count)
                _allocate_production_batches(item)
            OrderItem.objects.filter(order_id=instance.pk).update(stock_deducted=True)

        elif previous_status == DONE and instance.status != DONE:
            for item in items:
                if not item.stock_deducted:
                    continue
                _adjust_stock(*_stock_target(item), item.count)
                _release_production_allocation(item.pk)
            OrderItem.objects.filter(order_id=instance.pk).update(stock_deducted=False)


@receiver(pre_save, sender=OrderItem)
def track_previous_order_item(sender, instance, raw, **kwargs):
    if raw or instance.pk is None:
        instance._previous_count = None
        instance._previous_stock_deducted = False
        return
    previous = (
        OrderItem.objects.filter(pk=instance.pk)
        .values("count", "stock_deducted")
        .first()
    )
    instance._previous_count = previous["count"] if previous else None
    instance._previous_stock_deducted = previous["stock_deducted"] if previous else False


@receiver(post_save, sender=OrderItem)
def sync_warehouse_on_item_save(sender, instance, created, raw, **kwargs):
    """Позиция добавлена/изменена в уже готовом (DONE) заказе — сразу
    списывает разницу со склада. Плюс всегда пересчитывает total_prise
    заказа, т.к. total_prise самой позиции меняется в OrderItem.save()."""
    if raw:
        return

    with transaction.atomic():
        order_status = (
            Order.objects.filter(pk=instance.order_id)
            .values_list("status", flat=True)
            .first()
        )

        if order_status == DONE:
            previous_stock_deducted = getattr(
                instance, "_previous_stock_deducted", False
            )
            previous_count = getattr(instance, "_previous_count", None)

            if created or not previous_stock_deducted:
                delta = -instance.count
            else:
                delta = -(instance.count - previous_count)

            if delta:
                _adjust_stock(*_stock_target(instance), delta)

            if created or not previous_stock_deducted:
                _allocate_production_batches(instance)
            elif previous_count != instance.count:
                _resync_production_allocation(instance)

            if not instance.stock_deducted:
                OrderItem.objects.filter(pk=instance.pk).update(stock_deducted=True)

        _recalculate_order_total(instance.order_id)


@receiver(pre_delete, sender=OrderItem)
def release_production_allocation_before_item_delete(sender, instance, **kwargs):
    """До фактического удаления позиции (и до того, как FK
    ProductProductionSoldItem.order_item каскадно удалит привязанные записи)
    снимаем распределение по партиям и пересчитываем is_sold — иначе партия
    осталась бы помеченной проданной навсегда."""
    _release_production_allocation(instance.pk)


@receiver(post_delete, sender=OrderItem)
def revert_warehouse_on_item_delete(sender, instance, **kwargs):
    """Срабатывает и при удалении отдельной позиции, и каскадно при удалении
    всего заказа — stock_deducted хранится на самой позиции, поэтому решение
    "возвращать ли товар на склад" не зависит от того, жив ли ещё заказ."""
    with transaction.atomic():
        if instance.stock_deducted:
            _adjust_stock(*_stock_target(instance), instance.count)
        _recalculate_order_total(instance.order_id)
