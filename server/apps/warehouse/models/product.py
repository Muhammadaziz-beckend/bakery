from django.db import models
from utils.models import DataTimeCUAbstract, ParentalOrganization
from django_resized import ResizedImageField
from mptt.models import MPTTModel, TreeForeignKey

from django.core.exceptions import ValidationError


class Category(ParentalOrganization,MPTTModel):

    img = ResizedImageField(
        "Изображения",
        upload_to="category/",
        force_format="WEBP",
        quality=75,
        null=True,
        blank=True,
    )

    name = models.CharField(
        "Категория",
        max_length=87,
    )

    parent = TreeForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )

    class Meta:
        verbose_name = "Категория"
        verbose_name_plural = "Категории"
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name"], name="unique_category_name_per_org"
            ),
        ]

    class MPTTMeta:
        order_insertion_by = ["name"]

    def __str__(self):
        return f"{self.name}"


class Product(ParentalOrganization,DataTimeCUAbstract):
    
    img = ResizedImageField(
        "Изображения",
        upload_to="product/",
        force_format="WEBP",
        quality=90,
        null=True,
        blank=True,
    )

    name = models.CharField(
        "Названия",
        max_length=125,
    )

    category = models.ForeignKey(
        Category,
        models.CASCADE,
        related_name="products",
        verbose_name="Категория",
    )

    limit_warnings = models.PositiveBigIntegerField(
        "Лимит предупреждения",
        default=0,
    )

    count_in_warehouse = models.DecimalField(
        "Количество в складе",
        max_digits=10,
        decimal_places=2,
        default=0,
    )

    is_semi_finished_product = models.BooleanField(
        "Является полуфабрикатом",
        default=False,
    )

    price = models.DecimalField(
        "Стоимость",
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )

    cost_price = models.DecimalField(
        "Себестоимость",
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )

    best_before_date = models.PositiveBigIntegerField(
        "Срок годности в днях",
        default=1,
    )

    daily_order_limit = models.PositiveIntegerField(
        "Лимит заказов в день",
        default=0,
        help_text="Сколько штук этого товара можно принять в заказы на одну "
        "дату (суммарно по всем вариантам). 0 — без ограничения. На "
        "конкретную дату (напр. праздник) лимит можно переопределить "
        "отдельно — см. ProductOrderLimitOverride.",
    )

    class Meta:
        verbose_name = "Продукт"
        verbose_name_plural = "Продукты"

    def __str__(self):
        return f"{self.name} - {self.count_in_warehouse}"

    def clean(self):
        super().clean()
        if (
            not self.is_semi_finished_product
            and self.price is None
            and self.cost_price is None
        ):
            raise ValidationError(
                {
                    "price": "Стоимость обязательна для заполнения, если товар не является полуфабрикатом."
                }
            )


class ProductConsumption(DataTimeCUAbstract):

    product = models.ForeignKey(
        Product,
        models.CASCADE,
        verbose_name="Продукт",
        related_name="consumptions",
    )

    ingredient = models.ForeignKey(
        "warehouse.Ingredient",
        models.CASCADE,
        verbose_name="Ингридиент",
        related_name="products",
    )

    count_ingredient = models.DecimalField(
        "количество ингридиента",
        max_digits=10,
        decimal_places=3,
    )

    class Meta:
        verbose_name = "Расход продукта"
        verbose_name_plural = "Расходы продукта"

    def __str__(self):
        return f"{self.pk}) {self.product}"


class ProductVariant(DataTimeCUAbstract):
    # Вариант товара (напр. размер торта: 10, 15, 20 см) — у каждого своя
    # цена и своя рецептура (ProductVariantConsumption), а остаток на складе
    # считается отдельно для каждого варианта, а не суммарно на Product.
    # Вариант — опция: товары без размеров/модификаций продолжают работать
    # через Product.price/cost_price/count_in_warehouse и ProductConsumption
    # как раньше, без единого варианта.
    product = models.ForeignKey(
        Product,
        models.CASCADE,
        related_name="variants",
        verbose_name="Товар",
    )

    name = models.CharField(
        "Название варианта",
        max_length=64,
        help_text="Напр. размер: 10, 15, 20 см",
    )

    price = models.DecimalField(
        "Стоимость",
        max_digits=10,
        decimal_places=2,
    )

    cost_price = models.DecimalField(
        "Себестоимость",
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )

    count_in_warehouse = models.DecimalField(
        "Количество на складе",
        max_digits=10,
        decimal_places=2,
        default=0,
        editable=False,  # меняется только через производство/продажу партий
    )

    class Meta:
        verbose_name = "Вариант товара"
        verbose_name_plural = "Варианты товара"
        unique_together = ("product", "name")
        ordering = ("product", "name")

    def __str__(self):
        return f"{self.product.name} — {self.name}"


class ProductVariantConsumption(DataTimeCUAbstract):
    # Рецептура конкретного варианта — расход ингредиентов на 1 единицу
    # именно этого размера/модификации (у "Наполеон 10" и "Наполеон 15"
    # расход разный).
    variant = models.ForeignKey(
        ProductVariant,
        models.CASCADE,
        verbose_name="Вариант товара",
        related_name="consumptions",
    )

    ingredient = models.ForeignKey(
        "warehouse.Ingredient",
        models.CASCADE,
        verbose_name="Ингредиент",
        related_name="variant_consumptions",
    )

    count_ingredient = models.DecimalField(
        "Количество ингредиента",
        max_digits=10,
        decimal_places=3,
    )

    class Meta:
        verbose_name = "Расход варианта товара"
        verbose_name_plural = "Расходы вариантов товара"

    def __str__(self):
        return f"{self.pk}) {self.variant}"
