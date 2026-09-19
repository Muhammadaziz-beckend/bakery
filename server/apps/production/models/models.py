from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db.models import Sum

from decimal import Decimal
from datetime import timedelta

from apps.warehouse.models.product import Product, ProductConsumption, ProductVariant
from apps.warehouse.models.consumables import Ingredient
from utils.models import DataTimeCUAbstract


class ProductProduction(DataTimeCUAbstract):

    product = models.ForeignKey(
        "warehouse.Product",
        models.CASCADE,
        related_name="productions",
        verbose_name="Продукт",
    )

    variant = models.ForeignKey(
        "warehouse.ProductVariant",
        models.CASCADE,
        related_name="productions",
        verbose_name="Вариант товара",
        null=True,
        blank=True,
        help_text="Обязателен, если у товара есть варианты (размеры) — "
        "определяет, по какой рецептуре и с какого остатка списывается партия.",
    )

    old_count = models.DecimalField(
        "Предыдущее количество",
        max_digits=10,
        decimal_places=3,
        default=Decimal("0"),
        editable=False,  # заполняется только автоматически
    )

    count = models.DecimalField(
        "Количество",
        max_digits=10,
        decimal_places=3,
    )

    best_before_date = models.DateField(
        "Срок годности - до",
        null=True,
        blank=True,
        editable=False,
    )
    
    is_sold = models.BooleanField(
        "Продано",
        default=False,
    )

    class Meta:
        verbose_name = "Готовый продукт"
        verbose_name_plural = "Готовый продукты"

    def __str__(self):
        return f"{self.pk}) {self.product} - {self.count}"

    def clean(self):
        super().clean()

        if not self.pk and self.product_id and self.count and not self.best_before_date:
            try:
                shelf_life_days = self.product.best_before_date
            except Product.DoesNotExist:
                shelf_life_days = None

            if shelf_life_days:
                self.best_before_date = timezone.now().date() + timedelta(
                    days=shelf_life_days
                )

        if not self.pk and not self.best_before_date:
            # ни клиент не передал дату, ни у продукта не задан срок годности —
            # без явной даты партию создавать нельзя
            raise ValidationError(
                {
                    "best_before_date": "Не указан срок годности продукта — укажите дату вручную или задайте срок годности (в днях) в карточке продукта."
                }
            )

        if self.pk:
            return
        if not self.product_id or not self.count:
            return

        shortages = []
        for c in ProductConsumption.objects.filter(
            product_id=self.product_id
        ).select_related("ingredient"):
            needed = c.count_ingredient * self.count
            available = c.ingredient.count_in_warehouse
            if available < needed:
                shortages.append(
                    f"{c.ingredient}: нужно {needed}, на складе {available}"
                )

        if shortages:
            raise ValidationError(
                {"count": "Недостаточно сырья: " + "; ".join(shortages)}
            )


class ProductProductionIngredientConsumption(DataTimeCUAbstract):
    # снимок фактического расхода сырья на партию — нужен, чтобы при удалении
    # партии возвращать именно списанное количество, даже если рецептура (ProductConsumption)
    # с тех пор изменится
    production = models.ForeignKey(
        ProductProduction,
        models.CASCADE,
        related_name="ingredient_consumptions",
        verbose_name="Партия производства",
    )

    ingredient = models.ForeignKey(
        Ingredient,
        models.PROTECT,
        related_name="+",
        verbose_name="Ингредиент",
    )

    count_consumed = models.DecimalField(
        "Списано сырья",
        max_digits=10,
        decimal_places=3,
    )

    class Meta:
        verbose_name = "Расход сырья по партии"
        verbose_name_plural = "Расходы сырья по партиям"

    def __str__(self):
        return f"{self.production_id}) {self.ingredient} - {self.count_consumed}"


class ProductProductionSoldItem(DataTimeCUAbstract):

    production = models.ForeignKey(
        ProductProduction,
        on_delete=models.PROTECT,
        related_name="sold_items",
        verbose_name="Партия производства",
    )

    count = models.DecimalField(
        "Количество",
        max_digits=10,
        decimal_places=3,
    )

    order_item = models.ForeignKey(
        "order.OrderItem",
        models.CASCADE,
        related_name="production_sold_items",
        verbose_name="Позиция заказа",
        null=True,
        blank=True,
        editable=False,
        help_text="Заполняется автоматически при переходе заказа в «готово» — "
        "распределение по партиям FIFO (см. apps/order/signals/order.py). "
        "Пусто для позиций, проданных вручную через админку.",
    )

    class Meta:
        verbose_name = "Проданная позиция"
        verbose_name_plural = "Проданные позиции"

    def __str__(self):
        return f"{self.pk}) {self.production} - {self.count}"

    def clean(self):
        super().clean()
        if self.pk or not self.production_id or not self.count:
            return  # редактирование продажи не поддерживаем — правки только через отмену+новую продажу

        already_sold = (
            ProductProductionSoldItem.objects
            .filter(production_id=self.production_id)
            .aggregate(total=Sum("count"))["total"] or Decimal("0")
        )
        production = ProductProduction.objects.get(pk=self.production_id)
        remaining = production.count - already_sold

        if self.count > remaining:
            raise ValidationError({
                "count": f"Нельзя продать больше, чем осталось в партии. Остаток: {remaining}"
            })