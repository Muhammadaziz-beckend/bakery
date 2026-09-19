# Деплой и настройка продакшен-сервера

Этот документ описывает, как с нуля поднять бэкенд + оба фронтенда проекта
на VPS, и фиксирует грабли, на которые уже наступали при первом деплое.

## Архитектура

- **Бэкенд**: Django 5.1 + DRF, ASGI (`core.asgi:application`) через `uvicorn`,
  systemd-сервис `bakery-backend`, слушает `127.0.0.1:8000`.
- **БД**: SQLite (`server/db.sqlite3`) — так задано в `core/database.py` по
  умолчанию (блок PostgreSQL в файле закомментирован). Если понадобится
  Postgres — раскомментировать блок и поднять отдельный сервис/контейнер.
- **client_web** — витрина для клиентов пекарни, раздаётся по поддоменам
  организаций (`<slug>.<STOREFRONT_BASE_DOMAIN>`), собирается один раз и
  ходит в API по фиксированному `VITE_API`.
- **web** — внутренняя админ-панель (заказы/производство/склад/долги),
  отдельный домен, тоже статика.
- **nginx** — реверс-прокси до Django + раздача статики фронтендов и
  `/static/`, `/media/` бэкенда (Django их не отдаёт, когда `DEBUG=False`).
- **Cloudflare** — DNS + проксирование (оранжевое облако само терминирует
  HTTPS, на origin-сервере SSL не настраивается). При создании/удалении
  организации Django сам создаёт/удаляет DNS A-запись поддомена и
  генерирует/удаляет nginx-конфиг для него — см. `apps/organization/provisioning.py`.

Текущий продакшен: сервер `72.56.16.210`, домены
`bakery.maximumcomfort.pro` (API) и `bakery-admin.maximumcomfort.pro`
(админка), `STOREFRONT_BASE_DOMAIN=maximumcomfort.pro` (поддомены
организаций).

## Предварительные требования

- VPS с Ubuntu, root-доступ по SSH.
- DNS A-записи в Cloudflare, указывающие на IP сервера, для домена API и
  домена админки (проксируемые — оранжевое облако).
- Cloudflare API-токен с правами на редактирование DNS-зоны (Zone → DNS →
  Edit) и Zone ID зоны — нужны для автосоздания поддоменов организаций.
- Доступ к приватному GitHub-репозиторию (см. раздел про git ниже — на
  сервере сейчас нет рабочих credentials, код обновляется вручную).

## ⚠️ Критично: версия Python

Не используйте Python 3.14 (дефолтный `python3` на свежих
Ubuntu/26.04) — Django 5.1.3 с ним несовместим: ломается
`copy.copy()` контекста шаблонов (`AttributeError: 'super' object has no
attribute 'dicts'`), из-за чего **весь Django admin отдаёт 500** на любой
странице с наследованием шаблонов. Проверялось и воспроизводилось лично.

Нужен **Python 3.12**. Если его нет в apt (как на Ubuntu 26.04), поставить
готовую сборку:

```bash
cd /tmp
curl -fsSL -o cpython312.tar.gz \
  "https://github.com/astral-sh/python-build-standalone/releases/download/20250902/cpython-3.12.11+20250902-x86_64-unknown-linux-gnu-install_only.tar.gz"
mkdir -p /opt/python3.12
tar -xzf cpython312.tar.gz -C /opt/python3.12 --strip-components=1
/opt/python3.12/bin/python3.12 --version   # Python 3.12.11
rm -f cpython312.tar.gz
```

Все venv для этого проекта создавать через `/opt/python3.12/bin/python3.12`,
не через системный `python3`.

## 1. Системные пакеты

```bash
apt-get update
apt-get install -y python3-venv python3-pip rsync git nginx \
  libjpeg-dev zlib1g-dev libfreetype-dev liblcms2-dev libopenjp2-7-dev \
  libtiff-dev libwebp-dev libpq-dev build-essential
```

(`libjpeg-dev` и compan — иначе Pillow пытается собраться из исходников и
падает с `RequiredDependencyException: jpeg`, если под нужный Python нет
готового wheel.)

## 2. Код на сервере

Репозиторий приватный. Варианты синхронизации:

- **Deploy key** (рекомендуется) — сгенерировать ключ на сервере,
  добавить публичную часть в GitHub → Settings → **Deploy keys** именно
  этого репозитория (не в личные SSH keys аккаунта!), `git remote set-url
  origin git@github.com:Muhammadaziz-beckend/bakery.git`.
- **PAT через git credential store** — `git config --global
  credential.helper store`, положить `https://<token>@github.com` в
  `~/.git-credentials` (права `600`).
- Если ни один из способов не настроен — код синхронизируется вручную
  через `scp`/`rsync` с локальной машины, где git уже авторизован.

```bash
git clone <repo> /var/www/bakery   # или git pull, если уже склонировано
```

### ⚠️ Миграции не в git

`server/.gitignore` содержит `migrations/` **без исключений**, поэтому
файлы миграций всех приложений никогда не попадают в репозиторий. После
`git clone`/`git pull` на сервере их physически нет — `manage.py migrate`
упадёт (`no such table: ...`). Копировать миграции отдельно, вручную, с
машины, где они есть:

```bash
rsync -a --include='*/' --include='migrations/**' --exclude='*' \
  <local>/server/apps/ root@<server>:/var/www/bakery/server/apps/
```

**Лучше это исправить в коде**: убрать `migrations/` из
`server/.gitignore` (оставить игнор только на `__pycache__`) и закоммитить
существующие файлы миграций — иначе каждый деплой на новый сервер будет
наступать на те же грабли.

## 3. Виртуальное окружение

```bash
cd /var/www/bakery/server
/opt/python3.12/bin/python3.12 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
```

## 4. `.env` на сервере

Файл `server/.env` **не** в git (правильно — там секреты). Заполнить по
образцу `server/.envExenpl`, продакшен-значения:

```env
SECRET_KEY=<сгенерировать длинный случайный ключ>

DEBUG=False

PORT_WEB=8000

AUTH_MODE=token

STOREFRONT_BASE_DOMAIN=maximumcomfort.pro

CLOUDFLARE_API_TOKEN=<токен с правами Zone.DNS Edit>
CLOUDFLARE_ZONE_ID=<zone id зоны maximumcomfort.pro>
CLOUDFLARE_RECORD_TYPE=A
CLOUDFLARE_PROXIED=true
ORIGIN_HOST=<IP сервера>

NGINX_SITES_DIR=/etc/nginx/sites-enabled
NGINX_FRONTEND_ROOT=/var/www/client_web/dist
NGINX_RELOAD_COMMAND=nginx -s reload
```

Сгенерировать `SECRET_KEY`:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(50))"
```

`NGINX_RELOAD_COMMAND=nginx -s reload` работает без `sudo`, только если
процесс Django запущен от `root` (см. раздел про systemd ниже — сейчас
так и есть). Если вместо этого завести отдельного непривилегированного
пользователя для процесса — нужно выдать ему через
`/etc/sudoers.d/` NOPASSWD-права ровно на `/usr/sbin/nginx -s reload`
(шаблон см. в `server/deploy/nginx/bakery.conf.example`) и сменить команду
на `sudo /usr/sbin/nginx -s reload`.

Права на файл: `chmod 600 server/.env`.

## 5. Миграции, статика, суперпользователь

```bash
cd /var/www/bakery/server
./venv/bin/python manage.py migrate --noinput
./venv/bin/python manage.py collectstatic --noinput
```

Суперпользователь логинится по телефону (`USERNAME_FIELD = "phone"`, см.
`apps/account/models/auth.py`), не по email/username:

```bash
DJANGO_SUPERUSER_PHONE="+996XXXXXXXXX" \
DJANGO_SUPERUSER_PASSWORD="<пароль>" \
./venv/bin/python manage.py createsuperuser --noinput
```

## 6. systemd-сервис бэкенда

`/etc/systemd/system/bakery-backend.service`:

```ini
[Unit]
Description=Bakery Django backend (uvicorn)
After=network.target

[Service]
WorkingDirectory=/var/www/bakery/server
ExecStart=/var/www/bakery/server/venv/bin/uvicorn core.asgi:application --host 127.0.0.1 --port 8000 --workers 3
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now bakery-backend
```

Сервис без `User=` запускается от `root` — это осознанное упрощение для
одиночного личного VPS (сам процесс дописывает nginx-конфиги и
перезагружает nginx без sudo). Для более строгой изоляции — см. заметку
про `NGINX_RELOAD_COMMAND` выше.

## 7. nginx: API-домен

`/etc/nginx/sites-available/bakery-api.conf` → симлинк в
`sites-enabled/`:

```nginx
server {
    listen 80;
    server_name bakery.maximumcomfort.pro;

    client_max_body_size 20m;

    location /static/ {
        alias /var/www/bakery/server/staticfiles/;
    }

    location /media/ {
        alias /var/www/bakery/server/media/;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`/static/` и `/media/` отдаёт nginx напрямую — при `DEBUG=False` Django
их не раздаёт (`django.conf.urls.static.static()` работает только при
`DEBUG=True`).

## 8. nginx: домен админ-панели (`web`)

`/etc/nginx/sites-available/bakery-admin.conf`:

```nginx
server {
    listen 80;
    server_name bakery-admin.maximumcomfort.pro;

    root /var/www/bakery-admin/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
ln -sf /etc/nginx/sites-available/bakery-api.conf /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/bakery-admin.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## 9. Сборка и деплой фронтендов

Оба фронтенда собираются **локально** (или в CI), не на сервере —
`VITE_API` подставляется на этапе сборки. Продакшен-адрес API задаётся
через `.env.production` (не коммитить, локальный файл рядом с `.env`):

```env
VITE_API=https://bakery.maximumcomfort.pro/api/v1/
```

```bash
# client_web — витрина организаций (общий build для всех поддоменов)
cd client_web && npm install && npm run build
rsync -a dist/ root@<server>:/var/www/client_web/dist/

# web — внутренняя админка
cd web && npm install && npm run build
rsync -a dist/ root@<server>:/var/www/bakery-admin/dist/
```

`/var/www/client_web/dist` — это путь, который прописан в
`NGINX_FRONTEND_ROOT` в `.env`: именно отсюда Django берёт статику при
автогенерации nginx-конфига для нового поддомена организации
(`utils/nginx.py`).

## 10. Автопровижн поддоменов организаций

При создании/переименовании/удалении `Organization` (модель в
`apps/organization/models.py`) Django сам:

1. создаёт/обновляет/удаляет A-запись `<slug>.maximumcomfort.pro` в
   Cloudflare (`utils/cloudflare.py`);
2. пишет/удаляет nginx-конфиг `org-<slug>.conf` в `NGINX_SITES_DIR`,
   отдающий `NGINX_FRONTEND_ROOT` (`utils/nginx.py`);
3. перезагружает nginx (`NGINX_RELOAD_COMMAND`).

Работает только если в `.env` заполнены `CLOUDFLARE_API_TOKEN` +
`CLOUDFLARE_ZONE_ID` и `NGINX_SITES_DIR` + `NGINX_FRONTEND_ROOT`. Пустые
значения — фича молча выключена (специально, чтобы дев-окружение не
трогало боевой Cloudflare).

**Важно про удаление**: `Organization.delete()` (переопределён в модели)
вызывает деprovision корректно, но **массовое** удаление в admin
(«Delete selected») по умолчанию идёт через `QuerySet.delete()`, который
переопределённый `delete()` не вызывает — DNS-запись тогда не чистится.
В `apps/organization/admin.py` это закрыто через
`OrganizationAdmin.delete_queryset`, который удаляет объекты по одному.

## Известные баги, которые уже чинили (проверить, что фикс на месте)

- `server/core/cors.py` — `CORS_ALLOWED_ORIGINS` не должен содержать
  голые домены без схемы (`"maximumcomfort.pro"`,
  `"*.maximumcomfort.pro"`) — corsheaders такое не принимает, и
  `manage.py` вообще отказывается стартовать (`system check` error).
  Поддомены организаций уже покрыты через `CORS_ALLOWED_ORIGIN_REGEXES`.
- `apps/organization/admin.py` — `logo_image()` обращался к
  `obj.logo.url` без проверки на пустое поле → 500 на любой организации
  без загруженного лого. Нужна проверка `if not obj.logo: return "—"`.

## Проверка после деплоя

```bash
curl -I https://bakery.maximumcomfort.pro/admin/login/
curl -I https://bakery-admin.maximumcomfort.pro/
journalctl -u bakery-backend -n 50 --no-pager
```

Полный логин-флоу:

```bash
curl -X POST https://bakery.maximumcomfort.pro/api/v1/auth/login/ \
  -H "Content-Type: application/json" \
  -H "Origin: https://bakery-admin.maximumcomfort.pro" \
  -d '{"phone":"+996XXXXXXXXX","password":"<пароль>"}'
```

Должен вернуться `{"token": "..."}`.

## Обновление (повторный деплой)

```bash
cd /var/www/bakery && git pull            # либо scp/rsync изменённых файлов
cd server
./venv/bin/python manage.py migrate --noinput
./venv/bin/python manage.py collectstatic --noinput
systemctl restart bakery-backend
```

Если менялись фронтенды — пересобрать локально и `rsync` `dist/` заново
(см. раздел 9).
