from django.contrib import admin

from .models import Client


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "name",
        "last_name",
        "tel",
    )

    list_display_links = list_display

    search_fields = (
        "name",
        "last_name",
        "tel",
    )
