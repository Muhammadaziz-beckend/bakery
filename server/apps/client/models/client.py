from django.db import models
from phonenumber_field.modelfields import PhoneNumberField

from utils.models import ParentalOrganization


class Client(ParentalOrganization):

    name = models.CharField(
        "Имя",
        max_length=65,
    )
    last_name = models.CharField(
        "Фамилия",
        max_length=65,
        null=True,
        blank=True,
    )

    tel = PhoneNumberField(
        ("номер телефона"),
    )

    customer_account = models.ForeignKey(
        "storefront.CustomerAccount",
        models.SET_NULL,
        related_name="clients",
        verbose_name="Аккаунт покупателя",
        null=True,
        blank=True,
        editable=False,
        help_text="Заполняется автоматически, когда покупатель с личным "
        "кабинетом на сайте-витрине впервые оформляет заказ в этой "
        "организации (см. apps/storefront) — связывает CRM-запись клиента "
        "с его сквозным (across всех организаций) аккаунтом. Пусто для "
        "клиентов, добавленных вручную сотрудником.",
    )

    class Meta:
        verbose_name = "Клиент"
        verbose_name_plural = "Клиенты"
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "tel"], name="unique_client_tel_per_org"
            ),
        ]

    def __str__(self):
        return f"{self.pk}) {self.name}-{self.tel}"