from rest_framework import serializers

from ..models import Category


class CategoryBriefSerializer(serializers.ModelSerializer):
    """Короткое представление категории — для вложения в карточку товара."""

    class Meta:
        model = Category
        fields = ("id", "name", "img")


class ListCategorySerializer(serializers.ModelSerializer):
    products_count = serializers.IntegerField(source="products.count", read_only=True)

    class Meta:
        model = Category
        fields = (
            "id",
            "name",
            "img",
            "parent",
            "level",
            "products_count",
        )


class RetrieveCategorySerializer(serializers.ModelSerializer):
    products_count = serializers.IntegerField(source="products.count", read_only=True)

    class Meta:
        model = Category
        fields = (
            "id",
            "name",
            "img",
            "parent",
            "level",
            "products_count",
        )


class CategoryTreeSerializer(serializers.ModelSerializer):
    """Рекурсивное дерево категорий (MPTT). children заполняется из get_children()."""

    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = (
            "id",
            "name",
            "img",
            "parent",
            "level",
            "children",
        )

    def get_children(self, obj):
        return CategoryTreeSerializer(
            obj.get_children(), many=True, context=self.context
        ).data


class CreateCategorySerializer(serializers.ModelSerializer):

    class Meta:
        model = Category
        fields = (
            "id",
            "name",
            "img",
            "parent",
        )

    def validate_name(self, value):
        # уникальность теперь в рамках организации (UniqueConstraint на модели),
        # а не глобально — DRF больше не генерирует валидатор сам (name уже не
        # unique=True на поле), поэтому проверяем вручную
        request = self.context.get("request")
        if request:
            qs = Category.objects.filter(
                organization=request.user.organization, name=value
            )
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    "Категория с таким названием уже существует."
                )
        return value

    def validate_parent(self, value):
        if value is None:
            return value

        request = self.context.get("request")
        if request and value.organization_id != request.user.organization_id:
            raise serializers.ValidationError("Категория не найдена.")

        # MPTT не запрещает это на уровне БД, а дерево от такого ломается:
        # категория не может быть родителем самой себе или своему предку
        if self.instance is not None and (
            value.pk == self.instance.pk or value.is_descendant_of(self.instance)
        ):
            raise serializers.ValidationError(
                "Нельзя сделать родителем саму категорию или её потомка."
            )
        return value
