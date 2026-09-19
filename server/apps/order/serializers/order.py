from django.db import transaction
from rest_framework import serializers

from apps.client.serializers import ClientSerializer
from apps.warehouse.models import Product

from ..models import Order, OrderItem, ProductOrderLimitOverride
from ..services import check_order_capacity


class ProductBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ("id", "name", "price", "count_in_warehouse")


class OrderItemInlineSerializer(serializers.ModelSerializer):
    """Позиция заказа на запись — product/variant/count, order проставляется
    во view/сериализаторе заказа при создании."""

    class Meta:
        model = OrderItem
        fields = ("id", "product", "variant", "count")
        read_only_fields = ("id",)

    def validate_count(self, value):
        if value <= 0:
            raise serializers.ValidationError("Количество должно быть больше нуля.")
        return value

    def validate(self, attrs):
        # как и у партии производства (CreateProductProduction) — у товара с
        # вариантами (размерами) своя цена/остаток на каждом варианте, у
        # самого Product цена — заглушка, поэтому без variant позиция
        # посчиталась бы по 0
        product = attrs.get("product")
        variant = attrs.get("variant")

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


class OrderItemDetailSerializer(serializers.ModelSerializer):
    """Только для чтения — с деталями товара, как позиции прихода сырья."""

    product_detail = ProductBriefSerializer(source="product", read_only=True)
    variant_name = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = (
            "id",
            "product",
            "product_detail",
            "variant",
            "variant_name",
            "count",
            "total_prise",
        )

    def get_variant_name(self, obj):
        return obj.variant.name if obj.variant_id else None


class OrderItemBriefSerializer(serializers.ModelSerializer):
    """Лёгкая позиция для списка заказов — только название товара, без
    остатка/цены за штуку (это есть в OrderItemDetailSerializer для retrieve)."""

    product_name = serializers.CharField(source="product.name", read_only=True)
    variant_name = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = (
            "id",
            "product",
            "product_name",
            "variant",
            "variant_name",
            "count",
            "total_prise",
        )

    def get_variant_name(self, obj):
        return obj.variant.name if obj.variant_id else None


def _enforce_order_capacity(request, order_date, items, exclude_order_id, force):
    """Общая проверка дневного лимита товара для create/update заказа.
    Превышение лимита блокирует сохранение, если только принудительно не
    подтверждено (`force`) — а подтвердить его может только владелец
    организации (User.is_owner), не любой сотрудник."""
    overages = check_order_capacity(items, order_date, exclude_order_id=exclude_order_id)
    if not overages:
        return

    if not force:
        raise serializers.ValidationError(
            {
                "order_date": (
                    f"На {order_date} лимит по одному или нескольким товарам "
                    "уже заполнен."
                ),
                "limit_exceeded": overages,
            }
        )

    user = getattr(request, "user", None)
    if not (user and (user.is_owner or user.is_superuser)):
        raise serializers.ValidationError(
            {
                "force_over_limit": (
                    "Оформить заказ сверх лимита может только владелец "
                    "организации."
                ),
                "limit_exceeded": overages,
            }
        )


class ListOrderSerializer(serializers.ModelSerializer):
    """Позиции включены и в список (не только в retrieve) — карточка заказа
    на фронте показывает состав ("Хлеб белый ×2, Булочка ×4") без отдельного
    запроса на каждую карточку."""

    client_detail = ClientSerializer(source="client", read_only=True)
    items = OrderItemBriefSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = (
            "id",
            "client",
            "client_detail",
            "status",
            "receipt_method",
            "payment_status",
            "total_prise",
            "items",
            "order_date",
            "create_dt",
        )


class RetrieveOrderSerializer(serializers.ModelSerializer):
    client_detail = ClientSerializer(source="client", read_only=True)
    items = OrderItemDetailSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = (
            "id",
            "client",
            "client_detail",
            "status",
            "receipt_method",
            "payment_status",
            "total_prise",
            "items",
            "order_date",
            "create_dt",
            "update_dt",
        )


class CreateOrderSerializer(serializers.ModelSerializer):
    """Заказ вместе с позициями создаётся одним запросом. Каждая позиция
    сохраняется через `.create()` (не `bulk_create`) — именно её `save()`
    считает `total_prise`, а сигналы (`apps/order/signals/order.py`) списывают
    товар со склада, если заказ создаётся сразу со статусом `done`."""

    items = OrderItemInlineSerializer(many=True)
    force_over_limit = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
        help_text="Подтверждение оформить заказ сверх дневного лимита товара "
        "— доступно только владельцу организации.",
    )

    class Meta:
        model = Order
        fields = (
            "id",
            "client",
            "status",
            "receipt_method",
            "payment_status",
            "items",
            "order_date",
            "force_over_limit",
            "total_prise",
            "create_dt",
        )
        read_only_fields = ("total_prise",)
        extra_kwargs = {"order_date": {"required": True}}

    def validate_client(self, value):
        request = self.context["request"]
        if value.organization_id != request.user.organization_id:
            raise serializers.ValidationError("Клиент не найден.")
        return value

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Нужна хотя бы одна позиция заказа.")

        request = self.context["request"]
        # ключ — (товар, вариант): один и тот же товар с разными вариантами
        # (размерами) — не дубль, а разные позиции заказа
        seen = []
        for item in value:
            product = item["product"]
            if product.organization_id != request.user.organization_id:
                raise serializers.ValidationError("Товар не найден.")
            variant = item.get("variant")
            seen.append((product.pk, variant.pk if variant else None))

        if len(seen) != len(set(seen)):
            raise serializers.ValidationError(
                "Один и тот же товар (вариант) указан в заказе несколько раз."
            )
        return value

    def validate(self, attrs):
        force = attrs.pop("force_over_limit", False)
        _enforce_order_capacity(
            self.context["request"],
            attrs.get("order_date"),
            attrs.get("items", []),
            exclude_order_id=None,
            force=force,
        )
        return attrs

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        with transaction.atomic():
            order = Order.objects.create(**validated_data)
            for item in items_data:
                OrderItem.objects.create(order=order, **item)
        order.refresh_from_db()
        return order


class UpdateOrderSerializer(serializers.ModelSerializer):
    """Правка заказа. `items`, если передан, целиком заменяет текущие позиции
    (как рецептура товара) — отсутствие ключа в запросе позиции не трогает."""

    items = OrderItemInlineSerializer(many=True, required=False)
    force_over_limit = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
        help_text="Подтверждение оформить заказ сверх дневного лимита товара "
        "— доступно только владельцу организации.",
    )

    class Meta:
        model = Order
        fields = (
            "id",
            "client",
            "status",
            "receipt_method",
            "payment_status",
            "items",
            "order_date",
            "force_over_limit",
            "total_prise",
        )
        read_only_fields = ("total_prise",)

    def validate_client(self, value):
        request = self.context["request"]
        if value.organization_id != request.user.organization_id:
            raise serializers.ValidationError("Клиент не найден.")
        return value

    def validate_items(self, value):
        request = self.context["request"]
        seen = []
        for item in value:
            product = item["product"]
            if product.organization_id != request.user.organization_id:
                raise serializers.ValidationError("Товар не найден.")
            variant = item.get("variant")
            seen.append((product.pk, variant.pk if variant else None))

        if len(seen) != len(set(seen)):
            raise serializers.ValidationError(
                "Один и тот же товар (вариант) указан в заказе несколько раз."
            )
        return value

    def validate(self, attrs):
        force = attrs.pop("force_over_limit", False)
        items_provided = "items" in attrs
        order_date_provided = "order_date" in attrs

        if items_provided or order_date_provided:
            order_date = attrs.get(
                "order_date", self.instance.order_date if self.instance else None
            )
            if items_provided:
                items = attrs.get("items")
            else:
                items = [
                    {"product": i.product, "count": i.count}
                    for i in self.instance.items.all()
                ]
            _enforce_order_capacity(
                self.context["request"],
                order_date,
                items,
                exclude_order_id=self.instance.pk if self.instance else None,
                force=force,
            )
        return attrs

    def update(self, instance, validated_data):
        has_items = "items" in validated_data
        items_data = validated_data.pop("items", None)

        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()

            if has_items:
                instance.items.all().delete()
                for item in items_data:
                    OrderItem.objects.create(order=instance, **item)

        instance.refresh_from_db()
        return instance


class ProductOrderLimitOverrideSerializer(serializers.ModelSerializer):
    """Особый лимит товара на конкретную дату (напр. Новый год) — правит
    только владелец организации, см. ProductOrderLimitOverrideModelViewSet."""

    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = ProductOrderLimitOverride
        fields = ("id", "product", "product_name", "date", "limit")

    def validate_product(self, value):
        request = self.context["request"]
        if value.organization_id != request.user.organization_id:
            raise serializers.ValidationError("Товар не найден.")
        return value

    def validate(self, attrs):
        product = attrs.get("product", getattr(self.instance, "product", None))
        date = attrs.get("date", getattr(self.instance, "date", None))
        qs = ProductOrderLimitOverride.objects.filter(product=product, date=date)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {"date": "Для этого товара на эту дату уже задан особый лимит."}
            )
        return attrs
