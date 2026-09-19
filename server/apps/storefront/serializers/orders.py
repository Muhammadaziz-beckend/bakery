from django.db import transaction
from rest_framework import serializers

from apps.client.models import Client
from apps.order.models import Order, OrderItem
from apps.order.serializers import (
    OrderItemBriefSerializer,
    OrderItemDetailSerializer,
    OrderItemInlineSerializer,
)
from apps.order.services import check_order_capacity
from apps.organization.models import Organization
from core.constants import CHOICES_RECEIPT_METHOD, SELF_PICKUP

from .catalog import PublicOrganizationSerializer


class PublicCreateOrderSerializer(serializers.Serializer):
    """Оформление заказа покупателем. `client` не передаётся с фронта — он
    определяется по телефону авторизованного CustomerAccount (см. .create()),
    как и не бывает `force_over_limit`: покупатель никогда не может обойти
    дневной лимит товара, это доступно только владельцу-сотруднику
    (apps.order.serializers.order._enforce_order_capacity)."""

    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.filter(is_active=True)
    )
    items = OrderItemInlineSerializer(many=True)
    receipt_method = serializers.ChoiceField(
        choices=CHOICES_RECEIPT_METHOD, required=False, default=SELF_PICKUP
    )
    order_date = serializers.DateField()

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Нужна хотя бы одна позиция заказа.")
        return value

    def validate(self, attrs):
        organization = attrs["organization"]
        items = attrs["items"]

        seen = []
        for item in items:
            product = item["product"]
            if product.organization_id != organization.id:
                raise serializers.ValidationError(
                    {"items": "Товар не найден в этой организации."}
                )
            variant = item.get("variant")
            seen.append((product.pk, variant.pk if variant else None))

        if len(seen) != len(set(seen)):
            raise serializers.ValidationError(
                {"items": "Один и тот же товар указан в заказе несколько раз."}
            )

        overages = check_order_capacity(items, attrs["order_date"])
        if overages:
            raise serializers.ValidationError(
                {
                    "order_date": (
                        f"На {attrs['order_date']} лимит по одному или "
                        "нескольким товарам уже заполнен."
                    ),
                    "limit_exceeded": overages,
                }
            )
        return attrs

    def create(self, validated_data):
        customer = self.context["request"].user
        organization = validated_data["organization"]
        items_data = validated_data["items"]

        with transaction.atomic():
            client, created = Client.objects.get_or_create(
                organization=organization,
                tel=customer.phone,
                defaults={
                    "name": customer.name,
                    "last_name": customer.last_name,
                    "customer_account": customer,
                },
            )
            if not created and client.customer_account_id is None:
                client.customer_account = customer
                client.save(update_fields=["customer_account"])

            order = Order.objects.create(
                organization=organization,
                client=client,
                order_date=validated_data["order_date"],
                receipt_method=validated_data.get("receipt_method", SELF_PICKUP),
            )
            for item in items_data:
                OrderItem.objects.create(order=order, **item)

        order.refresh_from_db()
        return order


class PublicOrderListSerializer(serializers.ModelSerializer):
    organization = PublicOrganizationSerializer(read_only=True)
    items = OrderItemBriefSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = (
            "id",
            "organization",
            "status",
            "receipt_method",
            "payment_status",
            "total_prise",
            "items",
            "order_date",
            "create_dt",
        )


class PublicOrderDetailSerializer(PublicOrderListSerializer):
    items = OrderItemDetailSerializer(many=True, read_only=True)

    class Meta(PublicOrderListSerializer.Meta):
        fields = PublicOrderListSerializer.Meta.fields + ("update_dt",)
