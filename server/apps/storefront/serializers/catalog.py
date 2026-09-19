from rest_framework import serializers

from apps.organization.models import Organization
from apps.warehouse.models import Category, Product, ProductVariant


class PublicOrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ("id", "name", "logo", "address", "address_link")


class PublicCategoryTreeSerializer(serializers.ModelSerializer):
    """Дерево категорий одной организации — без products_count и прочих
    внутренних полей ListCategorySerializer/CategoryTreeSerializer."""

    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ("id", "name", "img", "children")

    def get_children(self, obj):
        return PublicCategoryTreeSerializer(
            obj.get_children(), many=True, context=self.context
        ).data


class PublicProductVariantSerializer(serializers.ModelSerializer):
    """Без cost_price (себестоимость — внутренние данные, не для витрины)."""

    in_stock = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = ("id", "name", "price", "in_stock")

    def get_in_stock(self, obj):
        return obj.count_in_warehouse > 0


class PublicProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    variants = PublicProductVariantSerializer(many=True, read_only=True)
    in_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "img",
            "category",
            "category_name",
            "price",
            "in_stock",
            "variants",
        )

    def get_in_stock(self, obj):
        variants = list(obj.variants.all())
        if variants:
            return any(v.count_in_warehouse > 0 for v in variants)
        return obj.count_in_warehouse > 0
