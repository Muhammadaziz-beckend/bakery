from django.db import transaction
from rest_framework import serializers

from ..models import ProductVariant, ProductVariantConsumption
from .consumption import IngredientBriefSerializer


class ProductVariantConsumptionInlineSerializer(serializers.ModelSerializer):
    """Позиция рецептуры варианта — только ingredient/count, variant
    проставляется во view/сериализаторе варианта при создании."""

    class Meta:
        model = ProductVariantConsumption
        fields = ("id", "ingredient", "count_ingredient")
        read_only_fields = ("id",)


class ProductVariantConsumptionDetailSerializer(serializers.ModelSerializer):
    """Только для чтения — с деталями ингредиента, как у обычной рецептуры товара."""

    ingredient_detail = IngredientBriefSerializer(source="ingredient", read_only=True)

    class Meta:
        model = ProductVariantConsumption
        fields = ("id", "ingredient", "ingredient_detail", "count_ingredient")


class ProductVariantSerializer(serializers.ModelSerializer):
    """Для списка/детали варианта (эндпоинт /product-variant/) — с рецептурой
    для чтения и возможностью заменить её целиком при создании/правке."""

    consumptions = ProductVariantConsumptionInlineSerializer(many=True, required=False)

    class Meta:
        model = ProductVariant
        fields = (
            "id",
            "product",
            "name",
            "price",
            "cost_price",
            "count_in_warehouse",
            "consumptions",
        )
        read_only_fields = ("count_in_warehouse",)

    def validate_product(self, value):
        request = self.context.get("request")
        if request and value.organization_id != request.user.organization_id:
            raise serializers.ValidationError("Товар не найден.")
        return value

    def validate_consumptions(self, value):
        ids = [item["ingredient"].pk for item in value]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError(
                "Один и тот же ингредиент указан в рецептуре несколько раз."
            )
        return value

    def create(self, validated_data):
        consumptions_data = validated_data.pop("consumptions", [])
        with transaction.atomic():
            variant = ProductVariant.objects.create(**validated_data)
            ProductVariantConsumption.objects.bulk_create(
                ProductVariantConsumption(variant=variant, **item)
                for item in consumptions_data
            )
        return variant

    def update(self, instance, validated_data):
        # как и у Product.consumptions: ключа может не быть вовсе (PATCH без
        # рецептуры) — тогда её не трогаем; [] означает "очистить рецептуру"
        has_consumptions = "consumptions" in validated_data
        consumptions_data = validated_data.pop("consumptions", None)

        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()

            if has_consumptions:
                instance.consumptions.all().delete()
                ProductVariantConsumption.objects.bulk_create(
                    ProductVariantConsumption(variant=instance, **item)
                    for item in consumptions_data
                )

        return instance


class ProductVariantInlineSerializer(serializers.ModelSerializer):
    """Вариант без поля product — для вложенного создания сразу с товаром
    (POST /product/): product проставляется во view/сериализаторе товара."""

    consumptions = ProductVariantConsumptionInlineSerializer(many=True, required=False)

    class Meta:
        model = ProductVariant
        fields = ("id", "name", "price", "cost_price", "consumptions")
        read_only_fields = ("id",)

    def validate_consumptions(self, value):
        ids = [item["ingredient"].pk for item in value]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError(
                "Один и тот же ингредиент указан в рецептуре несколько раз."
            )
        return value


class ProductVariantDetailSerializer(serializers.ModelSerializer):
    """Только для чтения, вложенно в товар (RetrieveProductSerializer) — с
    деталями ингредиентов в рецептуре, чтобы фронт мог сразу построить
    превью расхода/нехватки при выборе варианта на партию производства."""

    consumptions = ProductVariantConsumptionDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ProductVariant
        fields = (
            "id",
            "name",
            "price",
            "cost_price",
            "count_in_warehouse",
            "consumptions",
        )


class ProductVariantBriefSerializer(serializers.ModelSerializer):
    """Короткое представление — для списка товаров и выбора варианта в форме
    партии производства без лишней нагрузки."""

    class Meta:
        model = ProductVariant
        fields = ("id", "name", "price", "cost_price", "count_in_warehouse")
