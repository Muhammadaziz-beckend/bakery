from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum, Value, DecimalField
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.decorators import method_decorator

from drf_yasg import openapi
from drf_yasg.utils import swagger_auto_schema

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.warehouse.models import Ingredient, Product, ProductVariant
from apps.order.models import OrderItem
from core.constants import DONE as ORDER_DONE
from ..models import ProductProduction, ProductProductionIngredientConsumption

ZERO = Decimal("0")
MONEY = Decimal("0.01")

# столько же дней используется в ProductionJournal.jsx (daysLeft <= 2 -> "warning")
EXPIRY_WARNING_DAYS = 2

SOLD_ANNOTATION = Coalesce(
    Sum("sold_items__count"),
    Value(ZERO, output_field=DecimalField(max_digits=10, decimal_places=3)),
)


def _money(value):
    return (value or ZERO).quantize(MONEY)


def _period_range(period: str, date_from: str | None, date_to: str | None, today):
    if date_from or date_to:
        start = parse_date(date_from) if date_from else None
        end = parse_date(date_to) if date_to else today
        if end is None:
            end = today
        return "custom", start, end

    if period == "today":
        start = today
    elif period == "week":
        start = today - timedelta(days=today.weekday())
    elif period == "all":
        period, start = "all", None
    else:
        period, start = "month", today.replace(day=1)

    return period, start, today


@method_decorator(
    name="get",
    decorator=swagger_auto_schema(
        operation_summary="Сводный отчёт",
        operation_description="Агрегированная статистика бизнеса за период: сколько "
        "испечено (`produced_count`, по партиям производства) и сколько реально "
        "продано (`sold_count`, по заказам клиентов со статусом «готово»); "
        "себестоимость и выручка считаются по фактическим заказам (`total_prise` "
        "позиции заказа и текущей `cost_price` товара), не по факту выпечки; "
        "прибыль и маржа; стоимость склада (сырьё + готовая продукция); партии "
        "со скоро истекающим сроком годности; разбивка по товарам (произведено/"
        "продано/выручка/себестоимость/прибыль) и расход ингредиентов на "
        "производство с их долей в структуре затрат.",
        manual_parameters=[
            openapi.Parameter(
                "period",
                openapi.IN_QUERY,
                type=openapi.TYPE_STRING,
                description="today | week | month | all — по умолчанию month. "
                "Влияет на «произведено/продано/себестоимость/выручка/прибыль/"
                "маржа», «по товарам» и «расход ингредиентов». Продажи фильтруются "
                "по дате создания заказа (Order.create_dt), а не по дате перевода "
                "в статус «готово». «Склад» и «заканчивается срок» — всегда "
                "текущее состояние, вне периода. period игнорируется, если "
                "передан date_from и/или date_to.",
            ),
            openapi.Parameter(
                "date_from",
                openapi.IN_QUERY,
                type=openapi.TYPE_STRING,
                format=openapi.FORMAT_DATE,
                description="Начало произвольного периода (YYYY-MM-DD). Переопределяет period.",
            ),
            openapi.Parameter(
                "date_to",
                openapi.IN_QUERY,
                type=openapi.TYPE_STRING,
                format=openapi.FORMAT_DATE,
                description="Конец произвольного периода (YYYY-MM-DD, включительно). "
                "По умолчанию — сегодня.",
            ),
        ],
    ),
)
class ReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        today = timezone.localtime().date()
        period, start, end = _period_range(
            request.query_params.get("period", "month"),
            request.query_params.get("date_from"),
            request.query_params.get("date_to"),
            today,
        )

        # «Произведено» — сколько испекли за период (расход сырья на выпечку,
        # см. ingredient_consumption ниже). Это отдельная от продаж метрика:
        # партия может быть испечена и ещё не продана к концу периода.
        productions_qs = ProductProduction.objects.select_related("product", "variant")
        if start is not None:
            productions_qs = productions_qs.filter(create_dt__date__gte=start)
        if end is not None:
            productions_qs = productions_qs.filter(create_dt__date__lte=end)
        produced_by_product = {}
        produced_count = ZERO
        for p in productions_qs:
            produced_count += p.count
            produced_by_product[p.product_id] = (
                produced_by_product.get(p.product_id, ZERO) + p.count
            )

        # «Продано»/выручка/себестоимость — по фактическим заказам (Order), а
        # не по факту выпечки: раньше отчёт считал revenue = произведено × цена,
        # то есть предполагал 100% продажу испечённого в тот же день. Теперь,
        # когда есть реальные заказы, считаем по ним — только `done`-заказы
        # (в процессе/ожидании ещё не продажа, а `returned` уже не продажа —
        # она сама исключается, т.к. текущий статус заказа уже не `done`).
        # total_prise у позиции — цена товара на момент заказа (снапшот),
        # а себестоимость берём текущую (cost_price), как и раньше для
        # produced-варианта — снапшота себестоимости на позиции заказа нет.
        sold_items_qs = OrderItem.objects.filter(order__status=ORDER_DONE).select_related(
            "product"
        )
        if start is not None:
            sold_items_qs = sold_items_qs.filter(order__create_dt__date__gte=start)
        if end is not None:
            sold_items_qs = sold_items_qs.filter(order__create_dt__date__lte=end)

        by_product = {}
        cost_total = ZERO
        revenue_total = ZERO
        sold_count = ZERO

        for item in sold_items_qs:
            unit_cost = item.product.cost_price or ZERO
            revenue = item.total_prise
            cost = unit_cost * item.count

            sold_count += item.count
            cost_total += cost
            revenue_total += revenue

            entry = by_product.setdefault(
                item.product_id,
                {"sold_count": ZERO, "cost": ZERO, "revenue": ZERO},
            )
            entry["sold_count"] += item.count
            entry["cost"] += cost
            entry["revenue"] += revenue

        by_product_list = []
        for product in Product.objects.select_related("category"):
            entry = by_product.get(
                product.id, {"sold_count": ZERO, "cost": ZERO, "revenue": ZERO}
            )
            by_product_list.append(
                {
                    "product_id": product.id,
                    "name": product.name,
                    "category": product.category.name if product.category_id else None,
                    "produced_count": produced_by_product.get(product.id, ZERO),
                    "sold_count": entry["sold_count"],
                    "revenue": _money(entry["revenue"]),
                    "cost": _money(entry["cost"]),
                    "profit": _money(entry["revenue"] - entry["cost"]),
                }
            )
        by_product_list.sort(key=lambda row: row["revenue"], reverse=True)

        profit_total = revenue_total - cost_total
        margin_percent = (
            (profit_total / revenue_total * 100) if revenue_total else ZERO
        )

        # расход ингредиентов — по фактическому снапшоту списания (см.
        # ProductProductionIngredientConsumption), а не по текущей рецептуре,
        # чтобы отчёт не «съезжал» задним числом при правке рецепта
        consumption_qs = ProductProductionIngredientConsumption.objects.select_related(
            "ingredient__unit"
        )
        if start is not None:
            consumption_qs = consumption_qs.filter(production__create_dt__date__gte=start)
        if end is not None:
            consumption_qs = consumption_qs.filter(production__create_dt__date__lte=end)

        ingredient_rows = {}
        for c in consumption_qs:
            row = ingredient_rows.setdefault(
                c.ingredient_id,
                {
                    "ingredient_id": c.ingredient_id,
                    "name": c.ingredient.name,
                    "unit": c.ingredient.unit.short_name,
                    "consumed": ZERO,
                    "price": c.ingredient.price,
                    "remaining": c.ingredient.count_in_warehouse,
                },
            )
            row["consumed"] += c.count_consumed

        ingredient_consumption = []
        ingredient_cost_total = ZERO
        for row in ingredient_rows.values():
            cost = row["consumed"] * row["price"]
            ingredient_cost_total += cost
            ingredient_consumption.append(
                {
                    "ingredient_id": row["ingredient_id"],
                    "name": row["name"],
                    "unit": row["unit"],
                    "consumed": row["consumed"],
                    "cost": _money(cost),
                    "remaining": row["remaining"],
                }
            )
        ingredient_consumption.sort(key=lambda row: row["cost"], reverse=True)

        cost_structure = [
            {
                "ingredient_id": row["ingredient_id"],
                "name": row["name"],
                "percent": (
                    float((row["cost"] / ingredient_cost_total * 100).quantize(Decimal("0.1")))
                    if ingredient_cost_total
                    else 0.0
                ),
            }
            for row in ingredient_consumption
        ]

        # заканчивающийся срок — текущее состояние склада, вне периода отчёта.
        # ИЗВЕСТНОЕ ОГРАНИЧЕНИЕ: remaining = count - sold_total, а sold_total
        # берётся из ProductProductionSoldItem — записи туда попадают только
        # вручную через админку (нет такого действия в вебе). Реальные продажи
        # через apps.order списывают Product.count_in_warehouse напрямую и не
        # привязаны к конкретной партии производства, поэтому remaining здесь
        # может показывать больше, чем есть на складе на самом деле, если
        # товар уже продан через заказы. Чтобы починить по-настоящему, нужно
        # список позиций заказа привязывать к конкретной партии (FIFO) — это
        # отдельная задача, не просто правка отчёта.
        threshold = today + timedelta(days=EXPIRY_WARNING_DAYS)
        expiring_soon = []
        expiring_qs = (
            ProductProduction.objects.select_related("product", "variant")
            .filter(
                is_sold=False,
                best_before_date__isnull=False,
                best_before_date__lte=threshold,
            )
            .annotate(sold_total=SOLD_ANNOTATION)
            .order_by("best_before_date")
        )
        for p in expiring_qs:
            remaining = p.count - p.sold_total
            if remaining <= 0:
                continue
            expiring_soon.append(
                {
                    "production_id": p.id,
                    "product": p.product.name,
                    "variant": p.variant.name if p.variant_id else None,
                    "count": remaining,
                    "best_before_date": p.best_before_date,
                    "create_dt": p.create_dt,
                    "days_left": (p.best_before_date - today).days,
                }
            )

        # стоимость склада — сырьё по текущей цене + готовая продукция по
        # себестоимости (полуфабрикаты/товары без cost_price в неё не входят)
        ingredients_value = sum(
            (ing.count_in_warehouse * ing.price for ing in Ingredient.objects.all()),
            ZERO,
        )
        products_value = sum(
            (
                p.count_in_warehouse * p.cost_price
                for p in Product.objects.all()
                if p.cost_price
            ),
            ZERO,
        )
        variants_value = sum(
            (
                v.count_in_warehouse * v.cost_price
                for v in ProductVariant.objects.all()
                if v.cost_price
            ),
            ZERO,
        )
        warehouse_value = ingredients_value + products_value + variants_value

        return Response(
            {
                "period": period,
                "date_from": start,
                "date_to": end,
                "summary": {
                    "produced_count": produced_count,
                    "sold_count": sold_count,
                    "cost_total": _money(cost_total),
                    "revenue_total": _money(revenue_total),
                    "profit_total": _money(profit_total),
                    "margin_percent": float(margin_percent.quantize(Decimal("0.1"))),
                    "warehouse_value": _money(warehouse_value),
                },
                "expiring_soon": expiring_soon,
                "by_product": by_product_list,
                "ingredient_consumption": ingredient_consumption,
                "cost_structure": cost_structure,
            }
        )
