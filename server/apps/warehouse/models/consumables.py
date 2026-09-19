from django.db import models

from utils.models import DataTimeCUAbstract, ParentalOrganization


class Unit(ParentalOrganization,):
    name = models.CharField(
        "Названия",
        max_length=32,
    )
    short_name = models.CharField(
        "Краткое названия",
        max_length=8,
    )

    class Meta:
        verbose_name = "Единица измерения"
        verbose_name_plural = "Единицы измерении"
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name"], name="unique_unit_name_per_org"
            ),
            models.UniqueConstraint(
                fields=["organization", "short_name"],
                name="unique_unit_short_name_per_org",
            ),
        ]

    def __str__(self):
        return f"{self.name} - {self.short_name}"


class Ingredient(ParentalOrganization,DataTimeCUAbstract):
    name = models.CharField(
        "Названия",
        max_length=128,
    )
    unit = models.ForeignKey(
        Unit,
        models.PROTECT,
        related_name="ingredients",
        verbose_name="Единица измерения",
    )
    limit_warnings = models.PositiveBigIntegerField(
        "Лимит предупреждения",
        default=0,
    )

    count_in_warehouse = models.DecimalField(
        "Количество в складе",
        max_digits=10,
        decimal_places=3,
        default=0,
    )

    price = models.DecimalField(
        "Стоимость",
        decimal_places=2,
        max_digits=10,
    )

    class Meta:
        verbose_name = "Ингредиент"
        verbose_name_plural = "Ингредиенты"
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name"], name="unique_ingredient_name_per_org"
            ),
        ]

    def __str__(self):
        return f"{self.name} - {self.unit} - {self.limit_warnings}"
