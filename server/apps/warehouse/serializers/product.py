from django.db import transaction
from rest_framework import serializers

from ..models import Product, ProductConsumption, ProductVariant, ProductVariantConsumption
from .category import CategoryBriefSerializer
from .consumption import (
    ProductConsumptionInlineSerializer,
    ProductConsumptionDetailSerializer,
)
from .variant import (
    ProductVariantBriefSerializer,
    ProductVariantDetailSerializer,
    ProductVariantInlineSerializer,
)


class ListProductSerializer(serializers.ModelSerializer):
    category_detail = CategoryBriefSerializer(source="category", read_only=True)
    consumptions_count = serializers.IntegerField(
        source="consumptions.count", read_only=True
    )
    variants = ProductVariantBriefSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "img",
            "category",
            "category_detail",
            "limit_warnings",
            "count_in_warehouse",
            "is_semi_finished_product",
            "price",
            "cost_price",
            "best_before_date",
            "daily_order_limit",
            "consumptions_count",
            "variants",
        )


class RetrieveProductSerializer(serializers.ModelSerializer):
    category_detail = CategoryBriefSerializer(source="category", read_only=True)
    consumptions = ProductConsumptionDetailSerializer(many=True, read_only=True)
    variants = ProductVariantDetailSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "img",
            "category",
            "category_detail",
            "limit_warnings",
            "count_in_warehouse",
            "is_semi_finished_product",
            "price",
            "cost_price",
            "best_before_date",
            "daily_order_limit",
            "consumptions",
            "variants",
        )


class CrateProductSerializer(serializers.ModelSerializer):

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "img",
            "category",
            "limit_warnings",
            "count_in_warehouse",
            "is_semi_finished_product",
            "price",
            "cost_price",
            "best_before_date",
            "daily_order_limit",
        )


class ProductImageSerializer(serializers.ModelSerializer):
    """Отдельный сериализатор только для фото товара — принимает multipart с
    файлом. Загрузка отделена от create/update-with-consumptions: та форма
    принимает вложенный список `consumptions`, а multipart-парсер DRF не умеет
    разбирать вложенные JSON-массивы, только плоские поля."""

    class Meta:
        model = Product
        fields = ("id", "img")


class CreateProductWithConsumptionsSerializer(serializers.ModelSerializer):
    """Товар вместе с рецептурой. Используется и для создания, и для правки:
    переданный список `consumptions` целиком заменяет текущую рецептуру,
    а если ключа в запросе нет — рецептура остаётся нетронутой.

    `variants` пишется только при создании (см. `create()`) — начальный набор
    вариантов удобно завести сразу вместе с товаром. При правке (`update()`)
    этот ключ, если он пришёл, молча игнорируется: у вариантов есть
    собственное состояние (остаток на складе, история партий производства),
    поэтому "удалить всё и пересоздать", как это безопасно делается для
    consumptions, для вариантов недопустимо — их правка/удаление только через
    отдельный `/product-variant/`."""

    # required=False/allow_null=True — переопределяет автогенерацию DRF из
    # DecimalField модели (которая иначе делает поле обязательным и запрещает
    # null): у полуфабриката и у товара с вариантами цены на самом Product
    # нет (см. Product.clean() и validate() ниже, который воспроизводит ту же
    # проверку — Product.clean() никогда не вызывается через DRF).
    price = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True
    )
    consumptions = ProductConsumptionInlineSerializer(many=True, required=False)
    variants = ProductVariantInlineSerializer(many=True, required=False)

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "img",
            "category",
            "limit_warnings",
            "count_in_warehouse",
            "is_semi_finished_product",
            "price",
            "cost_price",
            "best_before_date",
            "daily_order_limit",
            "consumptions",
            "variants",
        )
        read_only_fields = ("img",)

    def validate_category(self, value):
        request = self.context.get("request")
        if request and value.organization_id != request.user.organization_id:
            raise serializers.ValidationError("Категория не найдена.")
        return value

    def validate_consumptions(self, value):
        request = self.context.get("request")
        ingredient_ids = [item["ingredient"].pk for item in value]
        if len(ingredient_ids) != len(set(ingredient_ids)):
            raise serializers.ValidationError(
                "Один и тот же ингредиент указан в рецептуре несколько раз."
            )
        if request:
            for item in value:
                if item["ingredient"].organization_id != request.user.organization_id:
                    raise serializers.ValidationError("Ингредиент не найден.")
        return value

    def validate_variants(self, value):
        names = [item["name"].strip().lower() for item in value]
        if len(names) != len(set(names)):
            raise serializers.ValidationError(
                "Название варианта повторяется — у товара не может быть двух "
                "вариантов с одинаковым названием."
            )
        return value

    def validate(self, attrs):
        # у товара с вариантами цена не используется (задаётся на каждом
        # варианте) — форма шлёт "0" как безобидную заглушку, см. ProductFormModal;
        # для остальных цена обязательна, если товар не полуфабрикат
        is_semi_finished = attrs.get(
            "is_semi_finished_product",
            getattr(self.instance, "is_semi_finished_product", False),
        )
        has_variants = bool(attrs.get("variants")) or (
            self.instance is not None and self.instance.variants.exists()
        )
        price = attrs.get("price", getattr(self.instance, "price", None))
        if price is None and not is_semi_finished and not has_variants:
            raise serializers.ValidationError(
                {
                    "price": "Стоимость обязательна для заполнения, если товар "
                    "не является полуфабрикатом."
                }
            )
        return attrs

    def create(self, validated_data):
        consumptions_data = validated_data.pop("consumptions", [])
        variants_data = validated_data.pop("variants", [])
        with transaction.atomic():
            product = Product.objects.create(**validated_data)
            ProductConsumption.objects.bulk_create(
                ProductConsumption(product=product, **item)
                for item in consumptions_data
            )
            for variant_data in variants_data:
                variant_consumptions = variant_data.pop("consumptions", [])
                variant = ProductVariant.objects.create(
                    product=product, **variant_data
                )
                ProductVariantConsumption.objects.bulk_create(
                    ProductVariantConsumption(variant=variant, **item)
                    for item in variant_consumptions
                )
        return product

    def update(self, instance, validated_data):
        # ключа может не быть вовсе (PATCH без рецептуры) — тогда не трогаем её,
        # поэтому проверяем наличие ключа, а не пустоту списка: [] означает
        # "очистить рецептуру", а отсутствие — "оставить как есть"
        has_consumptions = "consumptions" in validated_data
        consumptions_data = validated_data.pop("consumptions", None)
        # варианты через этот сериализатор не редактируются (см. докстринг) —
        # см. ProductVariantModelViewSet
        validated_data.pop("variants", None)

        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()

            if has_consumptions:
                instance.consumptions.all().delete()
                ProductConsumption.objects.bulk_create(
                    ProductConsumption(product=instance, **item)
                    for item in consumptions_data
                )

        return instance
