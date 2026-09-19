from django.db.models import Sum

from core.constants import RETURNED

from .models import OrderItem, ProductOrderLimitOverride


def get_effective_limit(product, order_date):
    """Лимит товара на дату: особый лимит на эту дату (если задан), иначе
    базовый Product.daily_order_limit. И там, и там 0 значит "без лимита"."""
    override = ProductOrderLimitOverride.objects.filter(
        product_id=product.pk, date=order_date
    ).first()
    if override is not None:
        return override.limit
    return product.daily_order_limit


def get_ordered_count(product, order_date, exclude_order_id=None):
    """Сколько штук товара (суммарно по всем вариантам) уже заказано на эту
    дату — заказы со статусом RETURNED в счёт не идут, они фактически
    отменены."""
    qs = OrderItem.objects.filter(
        product_id=product.pk, order__order_date=order_date
    ).exclude(order__status=RETURNED)
    if exclude_order_id is not None:
        qs = qs.exclude(order_id=exclude_order_id)
    return qs.aggregate(total=Sum("count"))["total"] or 0


def check_order_capacity(items, order_date, exclude_order_id=None):
    """Для каждой позиции заказа считает, помещается ли она в дневной лимит
    товара на `order_date`. items — список dict с ключами product/count (как
    приходят из OrderItemInlineSerializer). Возвращает список превышений —
    пустой список значит лимитов никто не превышает."""
    if order_date is None:
        return []

    # один и тот же товар может встретиться в заказе несколькими позициями
    # (разные варианты/размеры) — лимит общий на товар, считаем их суммарно
    requested_by_product = {}
    for item in items:
        product = item["product"]
        product, total = requested_by_product.get(product.pk, (product, 0))
        requested_by_product[product.pk] = (product, total + item["count"])

    overages = []
    for product, requested in requested_by_product.values():
        limit = get_effective_limit(product, order_date)
        if limit == 0:
            continue

        already_ordered = get_ordered_count(
            product, order_date, exclude_order_id=exclude_order_id
        )
        available = limit - already_ordered
        if requested > available:
            overages.append(
                {
                    "product": product.pk,
                    "product_name": product.name,
                    "date": order_date,
                    "limit": limit,
                    "already_ordered": already_ordered,
                    "requested": requested,
                    "available": max(available, 0),
                }
            )

    return overages
