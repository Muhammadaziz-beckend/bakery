import concurrent.futures

from django.contrib import admin
from django.utils.html import format_html

from .models import Organization


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    
    list_display = (
        "logo_image",
        "id",
        "name",
        "address",
        "slug",
        "custom_domain",
        "is_active",
    )

    list_display_links = (
        "name",
        "address",
    )

    search_fields = (
        "name",
        "slug",
        "custom_domain",
    )
    
    list_editable = (
        "is_active",
    )
    
    
    def logo_image(self, obj):
        if not obj.logo:
            return "—"
        return format_html(f'<img src="{obj.logo.url}" style="max-width:100px; max-height:100px; border-radius:100px;"/>')

    def delete_queryset(self, request, queryset):
        # Массовое удаление ("Delete selected") в admin идёт через bulk
        # QuerySet.delete(), который не вызывает переопределённый
        # Organization.delete() — а значит, не чистит DNS-запись в
        # Cloudflare и nginx-конфиг (см. Organization.delete). Поэтому
        # чистим DNS/nginx отдельно: удаляем объекты из БД одним bulk-
        # запросом (быстро, без частично удалённой пачки), а сами вызовы
        # к Cloudflare/nginx для больших выборок гоняем параллельно —
        # иначе N объектов дают N последовательных внешних запросов внутри
        # одного admin-request и упираются в таймаут сервера/прокси.
        slugs = [slug for slug in queryset.values_list("slug", flat=True) if slug]
        queryset.delete()

        if not slugs:
            return

        from .provisioning import deprovision_subdomain

        with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(slugs), 8)) as executor:
            list(executor.map(deprovision_subdomain, slugs))
