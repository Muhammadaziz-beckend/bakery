from rest_framework import serializers

from ..models import TransactionIngredient, TransactionItemIngredient
from .supplier import SupplierSerializer
from .consumption import IngredientBriefSerializer


class TransactionItemIngredientInlineSerializer(serializers.ModelSerializer):
    """Позиция прихода на запись — только ingredient/count, transaction
    проставляется во view/сериализаторе транзакции при создании."""

    class Meta:
        model = TransactionItemIngredient
        fields = ("id", "ingredient", "count")
        read_only_fields = ("id",)

    def validate_count(self, value):
        if value <= 0:
            raise serializers.ValidationError("Количество должно быть больше нуля.")
        return value

    def validate_ingredient(self, value):
        request = self.context.get("request")
        if request and value.organization_id != request.user.organization_id:
            raise serializers.ValidationError("Ингредиент не найден.")
        return value


class TransactionItemIngredientDetailSerializer(serializers.ModelSerializer):
    """Только для чтения — с деталями ингредиента, как в рецептуре товара."""

    ingredient_detail = IngredientBriefSerializer(source="ingredient", read_only=True)

    class Meta:
        model = TransactionItemIngredient
        fields = ("id", "ingredient", "ingredient_detail", "count")


class ListTransactionIngredientSerializer(serializers.ModelSerializer):
    suppler_detail = SupplierSerializer(source="suppler", read_only=True)
    items_count = serializers.IntegerField(
        source="transaction_items.count", read_only=True
    )

    class Meta:
        model = TransactionIngredient
        fields = (
            "id",
            "suppler",
            "suppler_detail",
            "debt_from_supplier",
            "items_count",
            "create_dt",
        )


class RetrieveTransactionIngredientSerializer(serializers.ModelSerializer):
    suppler_detail = SupplierSerializer(source="suppler", read_only=True)
    items = TransactionItemIngredientDetailSerializer(
        source="transaction_items", many=True, read_only=True
    )

    class Meta:
        model = TransactionIngredient
        fields = (
            "id",
            "suppler",
            "suppler_detail",
            "debt_from_supplier",
            "items",
            "create_dt",
        )


class CreateTransactionIngredientSerializer(serializers.ModelSerializer):
    """Приход сырья от поставщика — сама транзакция и её позиции создаются
    одним запросом. Каждая позиция сохраняется через `.create()` (не
    `bulk_create`), потому что именно её `pre_save`-сигнал списывает/начисляет
    остаток на складе (`apps/warehouse/signals/transactionIngredient.py`) —
    bulk_create сигналы обходит."""

    items = TransactionItemIngredientInlineSerializer(source="transaction_items", many=True)

    class Meta:
        model = TransactionIngredient
        fields = (
            "id",
            "suppler",
            "debt_from_supplier",
            "items",
            "create_dt",
        )

    def validate_suppler(self, value):
        request = self.context.get("request")
        if request and value.organization_id != request.user.organization_id:
            raise serializers.ValidationError("Поставщик не найден.")
        return value

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError(
                "Нужна хотя бы одна позиция прихода."
            )
        ingredient_ids = [item["ingredient"].pk for item in value]
        if len(ingredient_ids) != len(set(ingredient_ids)):
            raise serializers.ValidationError(
                "Один и тот же ингредиент указан в приходе несколько раз."
            )
        return value

    def create(self, validated_data):
        # source="transaction_items" на поле items -> ключ в validated_data
        # соответствует source, а не имени поля сериализатора
        items_data = validated_data.pop("transaction_items")
        transaction_obj = TransactionIngredient.objects.create(**validated_data)
        for item in items_data:
            TransactionItemIngredient.objects.create(
                transaction=transaction_obj, **item
            )
        return transaction_obj
