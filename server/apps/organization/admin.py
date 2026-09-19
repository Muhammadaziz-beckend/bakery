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
