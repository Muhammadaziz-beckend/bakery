from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from apps.warehouse.serializers import SupplierSerializer

from .models import DebtFromSupplier, DebtFromSupplierItems


class DebtRepaymentSerializer(serializers.ModelSerializer):
    """Одно погашение долга — используется и как строка истории в
    retrieve-ответе, и как тело запроса для действия add-repayment."""

    class Meta:
        model = DebtFromSupplierItems
        fields = ("id", "repayment_amount", "create_dt")
        read_only_fields = ("id", "create_dt")

    def validate_repayment_amount(self, value):
        if value <= 0:
            raise ValidationError("Сумма погашения должна быть больше нуля.")
        return value


class DebtFromSupplierListSerializer(serializers.ModelSerializer):
    supplier_detail = SupplierSerializer(source="supplier", read_only=True)
    remaining = serializers.SerializerMethodField()

    class Meta:
        model = DebtFromSupplier
        fields = (
            "id",
            "supplier",
            "supplier_detail",
            "duty",
            "paid_off",
            "remaining",
            "is_paid_off",
            "create_dt",
            "update_dt",
        )
        read_only_fields = ("paid_off", "is_paid_off", "create_dt", "update_dt")

    def get_remaining(self, obj):
        return obj.duty - obj.paid_off


class DebtFromSupplierRetrieveSerializer(DebtFromSupplierListSerializer):
    """Долг вместе с историей погашений — используется и в retrieve, и как
    ответ на действие add-repayment (см. DebtFromSupplierModelViewSet)."""

    repayment_amounts = DebtRepaymentSerializer(many=True, read_only=True)

    class Meta(DebtFromSupplierListSerializer.Meta):
        fields = DebtFromSupplierListSerializer.Meta.fields + ("repayment_amounts",)


class DebtFromSupplierCreateSerializer(serializers.ModelSerializer):
    """Долг заводится только с суммой — погашения (paid_off/is_paid_off)
    добавляются отдельно через add-repayment, а не при создании."""

    class Meta:
        model = DebtFromSupplier
        fields = ("id", "supplier", "duty")

    def validate_supplier(self, value):
        request = self.context["request"]
        # Поставщик другой организации не должен даже 404 не отдавать —
        # он просто не существует с точки зрения этого пользователя.
        if value.organization_id != request.user.organization_id:
            raise ValidationError("Поставщик не найден.")
        return value

    def validate_duty(self, value):
        if value <= 0:
            raise ValidationError("Сумма долга должна быть больше нуля.")
        return value
