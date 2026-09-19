import re

from django.conf import settings
from django.db import models
from django.utils.text import slugify
from django_resized import ResizedImageField

from utils.models import DataTimeCUAbstract


class Organization(DataTimeCUAbstract):

    logo = ResizedImageField(
        "Изображения",
        upload_to="logo/",
        force_format="WEBP",
        quality=75,
        null=True,
        blank=True,
    )

    name = models.CharField(
        "Названия",
        max_length=95,
    )

    address = models.CharField(
        "Адрес",
        max_length=120,
    )

    address_link = models.URLField(
        ("Адрес ссылки"),
        max_length=200,
    )

    is_active = models.BooleanField(
        "Активна",
        default=False,
    )

    slug = models.SlugField(
        "Поддомен",
        max_length=63,
        unique=True,
        blank=True,
        help_text="Витрина доступна по адресу <поддомен>."
        f"{getattr(settings, 'STOREFRONT_BASE_DOMAIN', '')}. "
        "Если не заполнено — формируется автоматически из названия.",
    )

    custom_domain = models.CharField(
        "Свой домен",
        max_length=255,
        unique=True,
        null=True,
        blank=True,
        help_text="Например: vkusno-bakery.uz. Если указан — витрина "
        "открывается по нему вместо поддомена.",
    )

    class Meta:
        verbose_name = "Организация"
        verbose_name_plural = "Организации"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._original_slug = self.slug

    def __str__(self):
        return f"{self.pk}) {self.name}"

    @staticmethod
    def _normalize_domain(value):
        value = value.strip().lower()
        value = re.sub(r"^https?://", "", value)
        value = value.split("/")[0]
        return value

    def save(self, *args, **kwargs):
        if self.custom_domain:
            self.custom_domain = self._normalize_domain(self.custom_domain)
        else:
            self.custom_domain = None

        if not self.slug:
            base_slug = slugify(self.name) or "org"
            candidate = base_slug
            n = 1
            qs = Organization.objects.exclude(pk=self.pk)
            while qs.filter(slug=candidate).exists():
                n += 1
                candidate = f"{base_slug}-{n}"
            self.slug = candidate

        old_slug = self._original_slug
        slug_changed = self.slug != old_slug
        super().save(*args, **kwargs)
        self._original_slug = self.slug

        if slug_changed:
            from .provisioning import deprovision_subdomain, provision_subdomain

            if old_slug:
                deprovision_subdomain(old_slug)
            provision_subdomain(self)

    def delete(self, *args, **kwargs):
        slug = self.slug
        result = super().delete(*args, **kwargs)

        if slug:
            from .provisioning import deprovision_subdomain

            deprovision_subdomain(slug)

        return result

    @classmethod
    def resolve_by_host(cls, host):
        """Определяет организацию по хосту запроса: сначала по собственному
        домену пекарни (custom_domain), затем по поддомену вида
        `<slug>.STOREFRONT_BASE_DOMAIN`."""
        if not host:
            return None

        host = host.split(":")[0].strip().lower()

        organization = cls.objects.filter(
            is_active=True, custom_domain=host
        ).first()
        if organization is not None:
            return organization

        base_domain = getattr(settings, "STOREFRONT_BASE_DOMAIN", "")
        suffix = f".{base_domain}" if base_domain else ""
        if suffix and host.endswith(suffix):
            slug = host[: -len(suffix)]
            return cls.objects.filter(is_active=True, slug=slug).first()

        return None
