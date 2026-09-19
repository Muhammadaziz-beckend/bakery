import secrets

from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from phonenumber_field.modelfields import PhoneNumberField

from utils.models import DataTimeCUAbstract


def _generate_token_key():
    return secrets.token_hex(20)


class CustomerAccount(DataTimeCUAbstract):
    """Личный кабинет покупателя сайта-витрины (client_web) — сквозной по
    всем организациям, в отличие от apps.client.Client (CRM-запись клиента
    внутри одной конкретной организации). Не связан с apps.account.User —
    это посетитель сайта, а не сотрудник, поэтому не наследуется от
    AbstractBaseUser (AUTH_USER_MODEL уже занят apps.account.User)."""

    phone = PhoneNumberField("Номер телефона", unique=True)
    password = models.CharField("Пароль", max_length=128)
    name = models.CharField("Имя", max_length=65)
    last_name = models.CharField("Фамилия", max_length=65, null=True, blank=True)

    # Нужно для совместимости с DRF permissions.IsAuthenticated, которая
    # проверяет request.user.is_authenticated — как AnonymousUser.is_authenticated
    # у Django, только наоборот (всегда True для настоящего аккаунта).
    is_authenticated = True

    class Meta:
        verbose_name = "Аккаунт покупателя"
        verbose_name_plural = "Аккаунты покупателей"

    def __str__(self):
        return f"{self.pk}) {self.name} {self.phone}"

    def set_password(self, raw_password):
        self.password = make_password(raw_password)

    def check_password(self, raw_password):
        return check_password(raw_password, self.password)


class CustomerToken(models.Model):
    """Токен-аутентификация покупателей — параллельно основной аутентификации
    сотрудников (rest_framework.authtoken/JWT), см. CustomerTokenAuthentication."""

    key = models.CharField(max_length=64, primary_key=True, default=_generate_token_key)
    customer = models.OneToOneField(
        CustomerAccount, models.CASCADE, related_name="auth_token"
    )
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Токен покупателя"
        verbose_name_plural = "Токены покупателей"

    def __str__(self):
        return f"{self.customer} — {self.key[:8]}…"
