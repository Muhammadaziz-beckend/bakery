from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.exceptions import ValidationError as DRFValidationError

from ..models import ProductProduction, ProductProductionSoldItem


class ListProductProductionSoldItem(serializers.ModelSerializer):

    class Meta:
        model = ProductProductionSoldItem
        fields = ("id", "count")


class ListProductProduction(serializers.ModelSerializer):
    product = serializers.SerializerMethodField()
    product_id = serializers.IntegerField(read_only=True)
    variant_id = serializers.IntegerField(read_only=True)
    variant_name = serializers.SerializerMethodField()
    sales = ListProductProductionSoldItem(source="sold_items", many=True)

    class Meta:
        model = ProductProduction
        fields = (
            "id",
            "product",
            "product_id",
            "variant_id",
            "variant_name",
            "count",
            "best_before_date",
            "is_sold",
            "sales",
            "create_dt",
        )

    def get_product(self, obj):
        return obj.product.name

    def get_variant_name(self, obj):
        return obj.variant.name if obj.variant_id else None


class RetrieveProductProduction(serializers.ModelSerializer):
    product = serializers.SerializerMethodField()
    product_id = serializers.IntegerField(read_only=True)
    variant_id = serializers.IntegerField(read_only=True)
    variant_name = serializers.SerializerMethodField()
    sales = ListProductProductionSoldItem(source="sold_items", many=True)

    class Meta:
        model = ProductProduction
        fields = (
            "id",
            "product",
            "product_id",
            "variant_id",
            "variant_name",
            "count",
            "best_before_date",
            "is_sold",
            "sales",
            "create_dt",
        )

    def get_product(self, obj):
        return obj.product.name

    def get_variant_name(self, obj):
        return obj.variant.name if obj.variant_id else None


class CreateProductProduction(serializers.ModelSerializer):

    class Meta:
        model = ProductProduction
        fields = (
            "id",
            "product",
            "variant",
            "count",
        )

    def validate(self, attrs):
        product = attrs.get("product")
        variant = attrs.get("variant")

        request = self.context.get("request")
        if request and product.organization_id != request.user.organization_id:
            raise serializers.ValidationError({"product": "Товар не найден."})

        if product.variants.exists():
            if not variant:
                raise serializers.ValidationError(
                    {"variant": "У этого товара есть варианты — укажите, какой именно."}
                )
            if variant.product_id != product.pk:
                raise serializers.ValidationError(
                    {"variant": "Этот вариант принадлежит другому товару."}
                )
        elif variant:
            raise serializers.ValidationError(
                {"variant": "У этого товара нет вариантов."}
            )

        return attrs

    def create(self, validated_data):
        # Расход сырья и срок годности проверяются в pre_save-сигнале модели
        # (django.core.exceptions.ValidationError) — DRF его не обрабатывает
        # сам по себе и без перевода это падает 500-й, а не понятной 400-й ошибкой.
        try:
            return super().create(validated_data)
        except DjangoValidationError as exc:
            shortages = (getattr(exc, "params", None) or {}).get("shortages")
            if shortages:
                # структурированная нехватка сырья: конкретный ингредиент,
                # сколько нужно и сколько есть на складе — для отображения на фронте
                raise DRFValidationError(
                    {
                        "count": exc.messages,
                        "shortages": shortages,
                    }
                )
            detail = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            raise DRFValidationError(detail)


class UpdateProductProduction(serializers.ModelSerializer):
    """Только `count` — товар и вариант партии не меняются после создания:
    расход сырья, срок годности и остаток на складе уже посчитаны под
    конкретный товар/вариант при создании (см. сигналы в
    apps/production/signals/consumables.py)."""

    class Meta:
        model = ProductProduction
        fields = (
            "id",
            "count",
        )

    def update(self, instance, validated_data):
        try:
            return super().update(instance, validated_data)
        except DjangoValidationError as exc:
            shortages = (getattr(exc, "params", None) or {}).get("shortages")
            if shortages:
                raise DRFValidationError(
                    {
                        "count": exc.messages,
                        "shortages": shortages,
                    }
                )
            detail = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            raise DRFValidationError(detail)
