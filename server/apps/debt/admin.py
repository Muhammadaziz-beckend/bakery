from django.contrib import admin
from django.contrib.admin import TabularInline

from .models import DebtFromSupplier, DebtFromSupplierItems


class DebtFromSupplierItemsInline(TabularInline):
    model = DebtFromSupplierItems
    extra = 0
    readonly_fields = ("create_dt",)


@admin.register(DebtFromSupplier)
class DebtFromSupplierAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "supplier",
        "organization",
        "duty",
        "paid_off",
        "is_paid_off",
        "create_dt",
    )

    list_display_links = (
        "id",
        "supplier",
    )

    list_filter = (
        "is_paid_off",
    )

    search_fields = (
        "supplier__name",
        "supplier__tel",
    )

    autocomplete_fields = (
        "supplier",
    )

    readonly_fields = (
        "is_paid_off",
    )

    inlines = [DebtFromSupplierItemsInline]

    def organization(self, obj):
        return obj.supplier.organization

    organization.short_description = "Организация"
