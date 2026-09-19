from django.contrib import admin

from .models import ProductProduction,ProductProductionSoldItem

class ProductProductionSoldItemInline(admin.TabularInline):
    model = ProductProductionSoldItem
    extra = 1


@admin.register(ProductProduction)
class ProductProductionAdmin(admin.ModelAdmin):
    
    list_display = (
        "id",
        "product",
        "count",
        "best_before_date"
    )
    
    list_display_links= list_display
    
    inlines = [ProductProductionSoldItemInline]