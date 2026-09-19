from rest_framework import serializers

from ..models import Ingredient, Unit


class UnitSerializer(serializers.ModelSerializer):

    class Meta:
        model = Unit
        fields = ("id", "name", "short_name")

    def _check_unique(self, field, value):
        # уникальность в рамках организации (UniqueConstraint на модели), а
        # не глобально — поле больше не unique=True, поэтому без этого DRF
        # ничего сам не проверит
        request = self.context.get("request")
        if not request:
            return
        qs = Unit.objects.filter(
            organization=request.user.organization, **{field: value}
        )
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                "Единица измерения с таким значением уже существует."
            )

    def validate_name(self, value):
        self._check_unique("name", value)
        return value

    def validate_short_name(self, value):
        self._check_unique("short_name", value)
        return value


class ListIngredientSerializer(serializers.ModelSerializer):
    unit_detail = UnitSerializer(source="unit", read_only=True)
    is_below_limit = serializers.SerializerMethodField()

    class Meta:
        model = Ingredient
        fields = (
            "id",
            "name",
            "unit",
            "unit_detail",
            "limit_warnings",
            "count_in_warehouse",
            "is_below_limit",
            "price",
        )

    def get_is_below_limit(self, obj):
        return obj.count_in_warehouse <= obj.limit_warnings


class RetrieveIngredientSerializer(ListIngredientSerializer):
    pass


class CreateIngredientSerializer(serializers.ModelSerializer):
    """Только для создания — `count_in_warehouse` здесь это стартовый остаток,
    задаваемый вручную при заведении нового ингредиента (в карточке ещё нет
    ни одного прихода, взять начальный остаток больше неоткуда)."""

    class Meta:
        model = Ingredient
        fields = (
            "id",
            "name",
            "unit",
            "limit_warnings",
            "count_in_warehouse",
            "price",
        )

    def validate_unit(self, value):
        request = self.context.get("request")
        if request and value.organization_id != request.user.organization_id:
            raise serializers.ValidationError("Единица измерения не найдена.")
        return value

    def validate_name(self, value):
        request = self.context.get("request")
        if request and Ingredient.objects.filter(
            organization=request.user.organization, name=value
        ).exists():
            raise serializers.ValidationError(
                "Ингредиент с таким названием уже существует."
            )
        return value


class UpdateIngredientSerializer(serializers.ModelSerializer):
    """Для правки уже существующего ингредиента — без `count_in_warehouse`:
    после создания остаток меняется только приходом (`TransactionIngredient`)
    или расходом на производство, не прямым редактированием карточки."""

    class Meta:
        model = Ingredient
        fields = (
            "id",
            "name",
            "unit",
            "limit_warnings",
            "price",
        )

    def validate_unit(self, value):
        request = self.context.get("request")
        if request and value.organization_id != request.user.organization_id:
            raise serializers.ValidationError("Единица измерения не найдена.")
        return value

    def validate_name(self, value):
        request = self.context.get("request")
        if request:
            qs = Ingredient.objects.filter(
                organization=request.user.organization, name=value
            )
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    "Ингредиент с таким названием уже существует."
                )
        return value
