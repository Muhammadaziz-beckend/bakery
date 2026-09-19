from django.db import models

from core.constants import (
    CHOICES_PAYMENT_STATUS,
    CHOICES_RECEIPT_METHOD,
    CHOICES_STATUS_ORDER,
    PENDING,
    SELF_PICKUP,
    UNPAID,
)
from utils.models import DataTimeCUAbstract, ParentalOrganization


class Order(ParentalOrganization, DataTimeCUAbstract):

    order_date = models.DateField(
        "Дата заказа",
        null=True,
        blank=True,
        help_text="Дата, на которую оформлен заказ (самовывоз/доставка) — "
        "по ней считается дневной лимит товара (Product.daily_order_limit / "
        "ProductOrderLimitOverride). Не путать с create_dt — датой, когда "
        "заказ был оформлен в системе.",
    )

    client = models.ForeignKey(
        "client.Client",
        models.CASCADE,
        related_name="orders",
        verbose_name="Клиенты",
    )

    status = models.CharField(
        "Статус",
        choices=CHOICES_STATUS_ORDER,
        max_length=11,
        default=PENDING,
    )

    receipt_method = models.CharField(
        "Тип получения",
        choices=CHOICES_RECEIPT_METHOD,
        max_length=11,
        default=SELF_PICKUP,
    )

    payment_status = models.CharField(
        "статус оплаты",
        choices=CHOICES_PAYMENT_STATUS,
        max_length=6,
        default=UNPAID,
    )

    total_prise = models.DecimalField(
        "Общая цена",
        decimal_places=2,
        max_digits=10,
        default=0,
        editable=False,
    )

    class Meta:
        verbose_name = "Заказ"
        verbose_name_plural = "Заказы"

    def __str__(self):
        return f"{self.pk}) {self.client}"


class OrderItem(models.Model):
    order = models.ForeignKey(
        Order,
        models.CASCADE,
        related_name="items",
        verbose_name="Заказы",
    )

    product = models.ForeignKey(
        "warehouse.Product",
        models.CASCADE,
        related_name="orders_items",
        verbose_name="Продукт",
    )

    variant = models.ForeignKey(
        "warehouse.ProductVariant",
        models.CASCADE,
        related_name="order_items",
        verbose_name="Вариант товара",
        null=True,
        blank=True,
        help_text="Обязателен, если у товара есть варианты (размеры) — у них "
        "своя цена и свой остаток на складе, отдельно от самого товара.",
    )

    count = models.PositiveBigIntegerField(
        "Количество",
    )

    total_prise = models.DecimalField(
        "Общая цена",
        decimal_places=2,
        max_digits=10,
        default=0,
        editable=False,
    )

    stock_deducted = models.BooleanField(
        "Списано со склада",
        default=False,
        editable=False,
    )

    class Meta:
        verbose_name = "Дочерний объект заказа"
        verbose_name_plural = "Дочернии объекты заказов"

    def __str__(self):
        return f"{self.order}) {self.product}-{self.count}"

    def save(self, *args, **kwargs):
        price = (self.variant.price if self.variant_id else self.product.price) or 0
        self.total_prise = price * self.count
        super().save(*args, **kwargs)


class ProductOrderLimitOverride(ParentalOrganization, DataTimeCUAbstract):
    """Лимит заказов на конкретную календарную дату (напр. Новый год),
    переопределяющий Product.daily_order_limit только для неё — обычные дни
    продолжают жить по базовому лимиту товара."""

    product = models.ForeignKey(
        "warehouse.Product",
        models.CASCADE,
        related_name="limit_overrides",
        verbose_name="Товар",
    )

    date = models.DateField("Дата")

    limit = models.PositiveIntegerField(
        "Лимит на эту дату",
        help_text="0 — в этот день заказы на товар не ограничены.",
    )

    class Meta:
        verbose_name = "Особый лимит на дату"
        verbose_name_plural = "Особые лимиты на дату"
        constraints = [
            models.UniqueConstraint(
                fields=["product", "date"], name="unique_limit_override_per_product_date"
            ),
        ]
        ordering = ("-date",)

    def __str__(self):
        return f"{self.product} — {self.date}: {self.limit}"
