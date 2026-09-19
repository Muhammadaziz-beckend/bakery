import re
import subprocess
from pathlib import Path

from django.conf import settings

_TEMPLATE = """# Автоматически сгенерировано при создании/изменении организации.
# Правки будут перезаписаны при следующем изменении домена организации.
#
# Раздаёт статику client_web (SPA) под доменом/поддоменом организации.
# Django здесь не проксируется — фронтенд обращается к API по фиксированному
# адресу (VITE_API), общему для всех организаций; см. core/cors.py, где
# для этого разрешены cross-origin запросы с поддоменов STOREFRONT_BASE_DOMAIN.
server {{
    listen 80;
    server_name {domain};

    root {frontend_root};
    index index.html;

    location / {{
        try_files $uri $uri/ /index.html;
    }}
}}
"""

_DOMAIN_RE = re.compile(
    r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$"
)


class NginxProvisionError(Exception):
    pass


def _validate_domain(domain):
    if not _DOMAIN_RE.match(domain):
        raise NginxProvisionError(f"Некорректный домен для nginx: {domain!r}")


def config_path_for(slug):
    return Path(settings.NGINX_SITES_DIR) / f"org-{slug}.conf"


def _reload_nginx():
    if not settings.NGINX_RELOAD_COMMAND:
        return
    try:
        subprocess.run(
            settings.NGINX_RELOAD_COMMAND,
            shell=True,
            check=True,
            timeout=10,
            capture_output=True,
        )
    except (subprocess.SubprocessError, OSError) as exc:
        raise NginxProvisionError(f"Не удалось перезагрузить nginx: {exc}") from exc


def write_site_config(slug, domain):
    """Пишет конфиг nginx для домена организации (раздача client_web) и
    перезагружает nginx. Ничего не делает, если NGINX_SITES_DIR или
    NGINX_FRONTEND_ROOT не настроены (например, в dev)."""
    if not settings.NGINX_SITES_DIR or not settings.NGINX_FRONTEND_ROOT:
        return

    _validate_domain(domain)

    config_path = config_path_for(slug)
    try:
        config_path.write_text(
            _TEMPLATE.format(domain=domain, frontend_root=settings.NGINX_FRONTEND_ROOT)
        )
    except OSError as exc:
        raise NginxProvisionError(f"Не удалось записать {config_path}: {exc}") from exc

    _reload_nginx()


def remove_site_config(slug):
    """Удаляет конфиг nginx для старого slug организации (при переименовании
    или удалении) и перезагружает nginx. Ничего не делает, если
    NGINX_SITES_DIR не настроен."""
    if not settings.NGINX_SITES_DIR:
        return

    config_path = config_path_for(slug)
    try:
        config_path.unlink(missing_ok=True)
    except OSError as exc:
        raise NginxProvisionError(f"Не удалось удалить {config_path}: {exc}") from exc

    _reload_nginx()
