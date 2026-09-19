import os
import re

# cors
CORS_ALLOW_METHODS = (
    "DELETE",
    "GET",
    "OPTIONS",
    "PATCH",
    "POST",
    "PUT",
)

CORS_ALLOWED_ORIGINS = [
    # beck
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    # front
    "http://72.56.16.210",
    "https://maximumcomfort.pro",
    # поддомены организаций (*.maximumcomfort.pro) разрешены через
    # CORS_ALLOWED_ORIGIN_REGEXES ниже — corsheaders не поддерживает
    # wildcard-домены в CORS_ALLOWED_ORIGINS.
    #
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5174",
    "http://localhost:5174",
    "http://127.0.0.1:5175",
    "http://localhost:5175",
    "http://127.0.0.1:5176",
    "http://localhost:5176",
    # other
    "http://localhost",
    "http://127.0.0.1",
]

# Витрина каждой организации открыта на своём поддомене
# (<slug>.STOREFRONT_BASE_DOMAIN, см. Organization.resolve_by_host), но
# client_web собран один раз с фиксированным VITE_API — поэтому запросы к
# API идут с произвольного поддомена и должны проходить CORS.
# Свои домены организаций (custom_domain) сюда не попадают — регексом их
# заранее не перечислить, для них нужна отдельная проверка при появлении.
_STOREFRONT_BASE_DOMAIN = os.getenv("STOREFRONT_BASE_DOMAIN", "")

CORS_ALLOWED_ORIGIN_REGEXES = []
if _STOREFRONT_BASE_DOMAIN:
    _escaped_base_domain = re.escape(_STOREFRONT_BASE_DOMAIN)
    CORS_ALLOWED_ORIGIN_REGEXES.append(
        rf"^https?://([a-z0-9-]+\.)?{_escaped_base_domain}$"
    )

CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS + (
    [f"https://*.{_STOREFRONT_BASE_DOMAIN}", f"http://*.{_STOREFRONT_BASE_DOMAIN}"]
    if _STOREFRONT_BASE_DOMAIN
    else []
)
