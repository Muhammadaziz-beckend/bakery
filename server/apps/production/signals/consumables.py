# apps/warehouse/signals/product_production.py
from decimal import Decimal
from datetime import timedelta
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models.signals import pre_save, post_save, pre_delete
from django.dispatch import receiver
from django.db.models import Sum
from django.utils import timezone

from apps.production.models.models import (
    ProductProductionSoldItem,
    ProductProductionIngredientConsumption,
)

from ..models import ProductProduction
from apps.warehouse.models import (
    Ingredient,
    ProductConsumption,
    Product,
    ProductVariant,
    ProductVariantConsumption,
)


def _adjust_finished_stock(stock_model, stock_id, delta):
    """delta может быть отрицательным (уменьшение количества партии задним
    числом или удаление партии целиком) — часть этого товара (или варианта)
    могла уже уйти по реальным заказам (apps.order.OrderItem списывает
    Product/ProductVariant.count_in_warehouse напрямую, в обход
    ProductProductionSoldItem), поэтому остаток нельзя молча увести в минус."""
    obj = stock_model.objects.select_for_update().get(pk=stock_id)
    new_count = obj.count_in_warehouse + delta
    if new_count < 0:
        raise ValidationError(
            {
                "count": (
                    f"Нельзя выполнить операцию: часть «{obj}» уже продана "
                    f"(на складе {obj.count_in_warehouse}, нужно списать {-delta})."
                )
            }
        )
    stock_model.objects.filter(pk=stock_id).update(count_in_warehouse=new_count)


def _recipe_and_stock_target(instance: ProductProduction):
    """Для партии производства возвращает (queryset позиций расхода сырья,
    модель остатка, id остатка) — если указан вариант, расход и остаток
    считаются по нему (своя рецептура и свой склад на размер), иначе — как
    раньше, по самому товару."""
    if instance.variant_id:
        return (
            ProductVariantConsumption.objects.filter(
                variant_id=instance.variant_id
            ).select_related("ingredient"),
            ProductVariant,
            instance.variant_id,
        )
    return (
        ProductConsumption.objects.filter(
            product_id=instance.product_id
        ).select_related("ingredient"),
        Product,
        instance.product_id,
    )


@receiver(pre_save, sender=ProductProduction)
def set_best_before_date(sender, instance: ProductProduction, raw, **kwargs):
    # Model.clean() умеет вычислять эту дату из срока годности продукта, но
    # full_clean() вызывает только ModelForm (админка) — через API (DRF) он
    # никогда не запускается, поэтому без этого сигнала best_before_date
    # оставался бы NULL для каждой партии, созданной через API.
    # Срок годности — атрибут товара, общий для всех его вариантов.
    if raw or instance.pk or instance.best_before_date:
        return

    shelf_life_days = Product.objects.filter(pk=instance.product_id).values_list(
        "best_before_date", flat=True
    ).first()

    if not shelf_life_days:
        raise ValidationError(
            {
                "best_before_date": "Не указан срок годности продукта — укажите дату вручную "
                "или задайте срок годности (в днях) в карточке продукта."
            }
        )

    instance.best_before_date = timezone.now().date() + timedelta(days=shelf_life_days)


@receiver(pre_save, sender=ProductProduction)
def check_and_consume_ingredients(sender, instance: ProductProduction, raw, **kwargs):
    if raw or instance.pk:
        # обрабатываем только создание; редактирование уже существующей
        # партии производства — отдельная история (не пересчитываем задним числом)
        return

    with transaction.atomic():
        consumptions_qs, _stock_model, _stock_id = _recipe_and_stock_target(instance)
        consumptions = list(consumptions_qs)
        ingredient_ids = [c.ingredient_id for c in consumptions]

        locked = {
            ing.pk: ing
            for ing in Ingredient.objects.select_for_update().filter(
                pk__in=ingredient_ids
            )
        }

        shortages = []
        needed_by_ingredient = {}
        for c in consumptions:
            needed = c.count_ingredient * instance.count
            needed_by_ingredient[c.ingredient_id] = needed
            available = locked[c.ingredient_id].count_in_warehouse
            if available < needed:
                shortages.append(
                    {
                        "ingredient_id": c.ingredient_id,
                        "ingredient": str(c.ingredient),
                        "needed": str(needed),
                        "available": str(available),
                    }
                )

        if shortages:
            raise ValidationError(
                "Недостаточно сырья для производства.",
                code="insufficient_stock",
                params={"shortages": shortages},
            )

        for ingredient_id, needed in needed_by_ingredient.items():
            Ingredient.objects.filter(pk=ingredient_id).update(
                count_in_warehouse=models.F("count_in_warehouse") - needed
            )

        # запоминаем фактически списанное количество, чтобы после save()
        # зафиксировать снапшот расхода для этой партии (см. record_ingredient_consumption_snapshot)
        instance._pending_ingredient_consumption = needed_by_ingredient


@receiver(post_save, sender=ProductProduction)
def replenish_product_stock(
    sender, instance: ProductProduction, created, raw, **kwargs
):
    if raw or not created:
        return
    _consumptions_qs, stock_model, stock_id = _recipe_and_stock_target(instance)
    stock_model.objects.filter(pk=stock_id).update(
        count_in_warehouse=models.F("count_in_warehouse") + instance.count
    )


@receiver(post_save, sender=ProductProduction)
def record_ingredient_consumption_snapshot(
    sender, instance: ProductProduction, created, raw, **kwargs
):
    if raw or not created:
        return
    snapshot = getattr(instance, "_pending_ingredient_consumption", None)
    if not snapshot:
        return
    ProductProductionIngredientConsumption.objects.bulk_create(
        ProductProductionIngredientConsumption(
            production=instance,
            ingredient_id=ingredient_id,
            count_consumed=needed,
        )
        for ingredient_id, needed in snapshot.items()
    )


@receiver(pre_save, sender=ProductProduction)
def sync_product_stock_on_production_save(
    sender, instance: ProductProduction, raw, **kwargs
):
    if raw or instance.pk is None:
        # создание партии обрабатывает check_and_consume_ingredients + replenish_product_stock —
        # здесь пересчитываем склад только при редактировании count задним числом,
        # иначе остаток дублируется (см. баг с двойным начислением остатка)
        return

    with transaction.atomic():
        previous_count, previous_variant_id = (
            ProductProduction.objects.select_for_update()
            .filter(pk=instance.pk)
            .values_list("count", "variant_id")
            .first()
        ) or (Decimal("0"), None)

        delta = instance.count - previous_count
        instance.old_count = previous_count

        if not delta:
            return

        # вариант партии не меняется после создания (см. валидацию в
        # сериализаторе) — используем текущий instance.variant_id, он же
        # previous_variant_id
        stock_model = ProductVariant if previous_variant_id else Product
        stock_id = previous_variant_id or instance.product_id
        _adjust_finished_stock(stock_model, stock_id, delta)

        if not previous_count:
            # партия с нулевым количеством — пропорцию расхода сырья не определить
            return

        # пересчитываем сырьё пропорционально изменению count, используя
        # реальный расход этой партии (снапшот), а не текущую рецептуру —
        # так правки согласуются с тем, что было списано при производстве
        entries = list(
            ProductProductionIngredientConsumption.objects.filter(
                production_id=instance.pk
            ).select_related("ingredient")
        )
        if not entries:
            return

        locked = {
            ing.pk: ing
            for ing in Ingredient.objects.select_for_update().filter(
                pk__in=[e.ingredient_id for e in entries]
            )
        }

        shortages = []
        planned = []
        for entry in entries:
            rate = entry.count_consumed / previous_count
            ingredient_delta = rate * delta
            if ingredient_delta > 0:
                available = locked[entry.ingredient_id].count_in_warehouse
                if available < ingredient_delta:
                    shortages.append(
                        {
                            "ingredient_id": entry.ingredient_id,
                            "ingredient": str(entry.ingredient),
                            "needed": str(ingredient_delta),
                            "available": str(available),
                        }
                    )
            planned.append((entry, ingredient_delta))

        if shortages:
            raise ValidationError(
                "Недостаточно сырья, чтобы увеличить количество партии.",
                code="insufficient_stock",
                params={"shortages": shortages},
            )

        for entry, ingredient_delta in planned:
            if not ingredient_delta:
                continue
            Ingredient.objects.filter(pk=entry.ingredient_id).update(
                count_in_warehouse=models.F("count_in_warehouse") - ingredient_delta
            )
            entry.count_consumed = entry.count_consumed + ingredient_delta
            entry.save(update_fields=["count_consumed"])


@receiver(pre_save, sender=ProductProductionSoldItem)
def sell_from_production(sender, instance: ProductProductionSoldItem, raw, **kwargs):
    if raw or instance.pk:
        return

    with transaction.atomic():
        production = ProductProduction.objects.select_for_update().get(
            pk=instance.production_id
        )

        already_sold = ProductProductionSoldItem.objects.filter(
            production_id=instance.production_id
        ).aggregate(total=Sum("count"))["total"] or Decimal("0")
        remaining = production.count - already_sold
        if instance.count > remaining:
            raise ValidationError(
                {
                    "count": f"Нельзя продать больше, чем осталось в партии. Остаток: {remaining}"
                }
            )

        stock_model = ProductVariant if production.variant_id else Product
        stock_id = production.variant_id or production.product_id
        stock_model.objects.filter(pk=stock_id).update(
            count_in_warehouse=models.F("count_in_warehouse") - instance.count
        )

        if already_sold + instance.count >= production.count:
            ProductProduction.objects.filter(pk=production.pk).update(is_sold=True)


@receiver(pre_delete, sender=ProductProduction)
def revert_stock_on_production_delete(sender, instance: ProductProduction, **kwargs):
    # pre_delete, а не post_delete: снапшот расхода сырья (CASCADE от ProductProduction)
    # иначе будет удалён раньше, чем мы успеем его прочитать
    with transaction.atomic():
        # откатываем добавление готового продукта (или варианта) на склад
        stock_model = ProductVariant if instance.variant_id else Product
        stock_id = instance.variant_id or instance.product_id
        _adjust_finished_stock(stock_model, stock_id, -instance.count)

        snapshot = list(instance.ingredient_consumptions.all())
        if snapshot:
            # возвращаем именно то количество сырья, что было фактически
            # списано при производстве этой партии
            for entry in snapshot:
                Ingredient.objects.filter(pk=entry.ingredient_id).update(
                    count_in_warehouse=models.F("count_in_warehouse") + entry.count_consumed
                )
        else:
            # партии, созданные до появления снапшота расхода — возвращаем
            # по текущей рецептуре (может отличаться от фактического расхода)
            consumptions_qs, _stock_model, _stock_id = _recipe_and_stock_target(instance)
            for c in consumptions_qs:
                returned = c.count_ingredient * instance.count
                Ingredient.objects.filter(pk=c.ingredient_id).update(
                    count_in_warehouse=models.F("count_in_warehouse") + returned
                )
