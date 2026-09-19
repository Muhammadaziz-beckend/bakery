import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# django configurations
if not load_dotenv():
    raise Exception(".env Not Found")

SECRET_KEY = os.getenv("SECRET_KEY")
DEBUG = os.getenv("DEBUG", "true").lower() in ("1", "true", "yes", "on")

ALLOWED_HOSTS = ["*"]
AUTH_USER_MODEL = "account.User"

# Базовый домен витрины: организация с slug="vkusno" доступна по адресу
# vkusno.<STOREFRONT_BASE_DOMAIN>, см. Organization.resolve_by_host.
STOREFRONT_BASE_DOMAIN = os.getenv("STOREFRONT_BASE_DOMAIN", "")

# Автосоздание поддомена организации в Cloudflare + nginx-конфига, см.
# apps/organization/provisioning.py. Если CLOUDFLARE_API_TOKEN/ZONE_ID не
# заданы — DNS-запрос просто не отправляется (полезно для dev-окружения).
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_ZONE_ID = os.getenv("CLOUDFLARE_ZONE_ID", "")
CLOUDFLARE_RECORD_TYPE = os.getenv("CLOUDFLARE_RECORD_TYPE", "A")
# Проксировать через Cloudflare (оранжевое облако) — на бесплатных/pro
# планах для wildcard-записей недоступно, поэтому и нужна отдельная
# запись на каждую организацию.
CLOUDFLARE_PROXIED = os.getenv("CLOUDFLARE_PROXIED", "true").lower() in (
    "1", "true", "yes", "on",
)
# IP или хост вашего сервера — то, на что должна указывать DNS-запись
# (A-запись: IP; CNAME: хост).
ORIGIN_HOST = os.getenv("ORIGIN_HOST", "")

# Куда писать сгенерированный конфиг nginx для организации и как
# перезагрузить nginx после этого. Пусто — генерация конфигов отключена
# (по умолчанию в dev). Домен организации отдаёт статику client_web
# (NGINX_FRONTEND_ROOT) — Django на этих доменах не проксируется, фронтенд
# сам обращается к API по фиксированному адресу (VITE_API), см. core/cors.py.
NGINX_SITES_DIR = os.getenv("NGINX_SITES_DIR", "")
NGINX_FRONTEND_ROOT = os.getenv("NGINX_FRONTEND_ROOT", "")
NGINX_RELOAD_COMMAND = os.getenv("NGINX_RELOAD_COMMAND", "nginx -s reload")

LANGUAGE_CODE = "ru"

TIME_ZONE = "Asia/Bishkek"

USE_I18N = True

USE_TZ = True