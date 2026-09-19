from django.db import models
from utils.models import DataTimeCUAbstract


class DebtFromSupplier(DataTimeCUAbstract):
    supplier = models.ForeignKey(
        "warehouse.Supplier",
        models.CASCADE,
        related_name="debts_from_supplier",
    )

    duty = models.DecimalField(
        "Долг сумма",
        max_digits=10,
        decimal_places=2,
    )
    paid_off = models.DecimalField(
        "Погашенная сумма",
        max_digits=10,
        decimal_places=2,
        default=0,
    )

    is_paid_off = models.BooleanField(
        "Погашен",
        default=False,
    )

    class Meta:
        verbose_name = "Дол от поставщик"
        verbose_name_plural = "Доли от поставщиков"

    def __str__(self):
        return f"{self.supplier}-{self.duty}"

    def save(self, **kwargs):
        if self.duty <= self.paid_off:
            self.is_paid_off = True
        return super().save(**kwargs)


class DebtFromSupplierItems(DataTimeCUAbstract):

    debt = models.ForeignKey(
        DebtFromSupplier,
        models.CASCADE,
        related_name="repayment_amounts",
        verbose_name="Долг",
    )

    repayment_amount = models.DecimalField(
        "Погашенная сумма",
        max_digits=10,
        decimal_places=2,
        default=0,
    )

    class Meta:
        verbose_name = "Погашения долга"
        verbose_name_plural = "Погашении долгов"

    def __str__(self):
        return f"{self.debt} - {self.repayment_amount}"
