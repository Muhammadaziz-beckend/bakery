from rest_framework import serializers

from ..models import ProductConsumption, Ingredient


class ListProductConsumptionSerializers(serializers.ModelSerializer):

    class Meta:
        model = ProductConsumption
        fields = (
            "id",
            "product",
            "ingredient",
            "count_ingredient",
        )

class RetrieveProductConsumptionSerializers(serializers.ModelSerializer):

    class Meta:
        model = ProductConsumption
        fields = (
            "id",
            "product",
            "ingredient",
            "count_ingredient",
        )
        
class CreateProductConsumptionSerializer(serializers.ModelSerializer):

    class Meta:
        model = ProductConsumption
        fields = (
            "id",
            "product",
            "ingredient",
            "count_ingredient",
        )


class ProductConsumptionInlineSerializer(serializers.ModelSerializer):
    """Расход ингредиента без product — product проставляется во view при создании."""

    class Meta:
        model = ProductConsumption
        fields = (
            "id",
            "ingredient",
            "count_ingredient",
        )
        read_only_fields = ("id",)


class IngredientBriefSerializer(serializers.ModelSerializer):
    unit = serializers.CharField(source="unit.short_name", read_only=True)

    class Meta:
        model = Ingredient
        fields = ("id", "name", "unit", "count_in_warehouse")


class ProductConsumptionDetailSerializer(serializers.ModelSerializer):
    """Только для чтения — с деталями ингредиента (название, ед. изм., остаток на
    складе), чтобы фронт мог показать расход по рецептуре и посчитать нехватку сырья
    ещё до отправки запроса на создание партии."""

    ingredient_detail = IngredientBriefSerializer(source="ingredient", read_only=True)

    class Meta:
        model = ProductConsumption
        fields = (
            "id",
            "ingredient",
            "ingredient_detail",
            "count_ingredient",
        )