from django.db import models
from utils.models import DataTimeCUAbstract, ParentalOrganization


from phonenumber_field.modelfields import PhoneNumberField


class Supplier(ParentalOrganization, DataTimeCUAbstract):
    name = models.CharField(
        "Имя | Названия",
        max_length=65,
    )

    tel = PhoneNumberField(
        ("номер телефона"),
    )

    class Meta:
        verbose_name = "Поставщик"
        verbose_name_plural = "Поставщики"
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "tel"], name="unique_supplier_tel_per_org"
            ),
        ]

    def __str__(self):
        return f"{self.name} - {self.tel}"


class TransactionIngredient(ParentalOrganization, DataTimeCUAbstract):

    suppler = models.ForeignKey(
        Supplier, models.CASCADE, related_name="transactions_ingredient"
    )

    debt_from_supplier = models.DecimalField(
        "Долг сумма",
        max_digits=10,
        decimal_places=3,
        default=0,
    )

    class Meta:
        verbose_name = "Транзакция ингридиента"
        verbose_name_plural = "Транзакции ингридиентов"

    def __str__(self):
        return f"{self.pk}) {self.suppler}"


class TransactionItemIngredient(DataTimeCUAbstract):

    transaction = models.ForeignKey(
        TransactionIngredient,
        models.CASCADE,
        related_name="transaction_items",
        verbose_name="Транзакция",
    )

    ingredient = models.ForeignKey(
        "warehouse.Ingredient",
        models.CASCADE,
        related_name="transaction_items",
        verbose_name="Ингридиент (сырьё)",
    )

    count = models.DecimalField(
        "Количество",
        max_digits=10,
        decimal_places=3,
    )
    old_count = models.DecimalField(
        "Старое количество",
        max_digits=10,
        decimal_places=3,
        null=True,
        blank=True,
    )

    is_plus = models.BooleanField(
        "Добавлена",
        default=False,
    )

    class Meta:
        verbose_name = "Дочерний объект транзакция ингридиента"
        verbose_name_plural = "Дочерние объекты транзакции ингридиентов"

    def __str__(self):
        return f"{self.ingredient} - {self.count}"
