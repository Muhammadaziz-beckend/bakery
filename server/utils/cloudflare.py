import requests
from django.conf import settings

CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4"


class CloudflareError(Exception):
    pass


def _headers():
    return {
        "Authorization": f"Bearer {settings.CLOUDFLARE_API_TOKEN}",
        "Content-Type": "application/json",
    }


def _request(method, path, **kwargs):
    try:
        response = requests.request(
            method, f"{CLOUDFLARE_API_BASE}{path}", headers=_headers(), timeout=10, **kwargs
        )
        data = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise CloudflareError(str(exc)) from exc

    if not data.get("success"):
        raise CloudflareError(data.get("errors") or data)
    return data["result"]


def find_dns_record(name, record_type=None):
    record_type = record_type or settings.CLOUDFLARE_RECORD_TYPE
    results = _request(
        "GET",
        f"/zones/{settings.CLOUDFLARE_ZONE_ID}/dns_records",
        params={"type": record_type, "name": name},
    )
    return results[0] if results else None


def upsert_subdomain(name, content=None, proxied=None, record_type=None):
    """Создаёт DNS-запись `name` -> content (по умолчанию ORIGIN_HOST),
    проксируемую через Cloudflare, либо обновляет её, если уже существует.
    `name` — полный домен (например, "vkusno.bakery.uz")."""
    record_type = record_type or settings.CLOUDFLARE_RECORD_TYPE
    content = content or settings.ORIGIN_HOST
    proxied = settings.CLOUDFLARE_PROXIED if proxied is None else proxied

    if not content:
        raise CloudflareError("ORIGIN_HOST не настроен — некуда проксировать домен.")

    payload = {
        "type": record_type,
        "name": name,
        "content": content,
        "proxied": proxied,
        "ttl": 1,  # 1 = "Auto", обязателен при proxied=True
    }

    existing = find_dns_record(name, record_type=record_type)
    if existing:
        return _request(
            "PATCH",
            f"/zones/{settings.CLOUDFLARE_ZONE_ID}/dns_records/{existing['id']}",
            json=payload,
        )
    return _request(
        "POST", f"/zones/{settings.CLOUDFLARE_ZONE_ID}/dns_records", json=payload
    )


def delete_dns_record(name, record_type=None):
    """Удаляет DNS-запись `name`, если она существует. Используется при
    переименовании/удалении организации, чтобы не оставлять поддомен,
    указывающий на чужой (уже переехавший) origin."""
    existing = find_dns_record(name, record_type=record_type)
    if not existing:
        return None
    return _request(
        "DELETE",
        f"/zones/{settings.CLOUDFLARE_ZONE_ID}/dns_records/{existing['id']}",
    )
