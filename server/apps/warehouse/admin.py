from django.contrib import admin
from django.contrib.admin import TabularInline

from .models import *


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    
    list_display = (
        "name",
        "short_name",
    )
    
    list_display_links = list_display
    

@admin.register(Ingredient)
class IngredientAdmin(admin.ModelAdmin):
    
    list_display = (
        "name",
        "unit",
        "limit_warnings",
        "count_in_warehouse",
        "price",
    )
    
@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "name",
    )

    list_display_links = list_display

    search_fields = (
        "name",
        "tel",
    )


class TransactionItemIngredientInline(TabularInline):
    model = TransactionItemIngredient


@admin.register(TransactionIngredient)
class TransactionIngredientAdmin(admin.ModelAdmin):
    
    list_display = (
        "id",
        "suppler",
        "debt_from_supplier",
    )
    
    list_display_links = list_display
    
    inlines = [TransactionItemIngredientInline]
    
@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    
    list_display = (
        "name",
        "parent",
    )
    
    list_display_links = list_display
    
class ProductConsumptionInline(TabularInline):
    model = ProductConsumption
    extra = 1


class ProductVariantInline(TabularInline):
    model = ProductVariant
    extra = 0
    readonly_fields = ("count_in_warehouse",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "name",
        "count_in_warehouse",
    )

    list_display_links = list_display

    inlines = [ProductConsumptionInline, ProductVariantInline]


class ProductVariantConsumptionInline(TabularInline):
    model = ProductVariantConsumption
    extra = 1


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "product",
        "name",
        "price",
        "count_in_warehouse",
    )

    list_display_links = ("name",)

    inlines = [ProductVariantConsumptionInline]