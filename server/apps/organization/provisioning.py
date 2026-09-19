import logging

from django.conf import settings

from utils.cloudflare import CloudflareError, delete_dns_record, upsert_subdomain
from utils.nginx import NginxProvisionError, remove_site_config, write_site_config

logger = logging.getLogger(__name__)


def deprovision_subdomain(slug):
    """Удаляет DNS-запись и nginx-конфиг для старого slug — вызывается при
    переименовании поддомена организации (чтобы старый не остался висеть,
    указывая на тот же origin) и при удалении организации."""
    if not slug or not settings.STOREFRONT_BASE_DOMAIN:
        return

    domain = f"{slug}.{settings.STOREFRONT_BASE_DOMAIN}"

    if settings.CLOUDFLARE_API_TOKEN and settings.CLOUDFLARE_ZONE_ID:
        try:
            delete_dns_record(domain)
        except CloudflareError:
            logger.exception(
                "Cloudflare: не удалось удалить DNS-запись %s", domain
            )

    try:
        remove_site_config(slug)
    except NginxProvisionError:
        logger.exception("nginx: не удалось удалить конфиг для %s", domain)


def provision_subdomain(organization):
    """Создаёт/обновляет поддомен организации: DNS-запись в Cloudflare
    (проксируемая на ORIGIN_HOST) + nginx-конфиг с этим server_name.

    Вызывается из Organization.save() при создании организации и при
    смене slug. Ошибки только логируются — недоступность Cloudflare или
    nginx не должна ронять сохранение организации в БД."""
    if not organization.slug or not settings.STOREFRONT_BASE_DOMAIN:
        return

    domain = f"{organization.slug}.{settings.STOREFRONT_BASE_DOMAIN}"

    if settings.CLOUDFLARE_API_TOKEN and settings.CLOUDFLARE_ZONE_ID:
        try:
            upsert_subdomain(domain)
        except CloudflareError:
            logger.exception(
                "Cloudflare: не удалось создать DNS-запись для организации #%s (%s)",
                organization.pk, domain,
            )

    try:
        write_site_config(organization.slug, domain)
    except NginxProvisionError:
        logger.exception(
            "nginx: не удалось сгенерировать конфиг для организации #%s (%s)",
            organization.pk, domain,
        )
