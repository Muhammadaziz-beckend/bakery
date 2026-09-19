from django.contrib import admin
from django.contrib.admin import TabularInline

from .models import Order, OrderItem, ProductOrderLimitOverride


class OrderItemInline(TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ("total_prise", "stock_deducted")


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "client",
        "status",
        "payment_status",
        "receipt_method",
        "total_prise",
        "order_date",
        "create_dt",
    )

    list_display_links = list_display

    list_filter = (
        "status",
        "payment_status",
        "receipt_method",
        "order_date",
    )

    search_fields = (
        "client__name",
        "client__last_name",
        "client__tel",
    )

    readonly_fields = ("total_prise",)

    inlines = [OrderItemInline]


@admin.register(ProductOrderLimitOverride)
class ProductOrderLimitOverrideAdmin(admin.ModelAdmin):

    list_display = ("id", "product", "date", "limit", "organization")
    list_display_links = list_display
    list_filter = ("date",)
    search_fields = ("product__name",)
