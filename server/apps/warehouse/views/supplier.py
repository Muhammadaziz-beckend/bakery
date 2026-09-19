from django.utils.decorators import method_decorator
from drf_yasg.utils import swagger_auto_schema
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter

from apps.warehouse.serializers import SupplierSerializer
from utils.mixins import UltraModelViewSet
from ..models import Supplier


@method_decorator(
    name="list",
    decorator=swagger_auto_schema(operation_summary="Список поставщиков"),
)
@method_decorator(
    name="retrieve",
    decorator=swagger_auto_schema(operation_summary="Получить поставщика"),
)
@method_decorator(
    name="create",
    decorator=swagger_auto_schema(operation_summary="Создать поставщика"),
)
@method_decorator(
    name="update",
    decorator=swagger_auto_schema(operation_summary="Обновить поставщика"),
)
@method_decorator(
    name="partial_update",
    decorator=swagger_auto_schema(operation_summary="Частично обновить поставщика"),
)
@method_decorator(
    name="destroy",
    decorator=swagger_auto_schema(
        operation_summary="Удалить поставщика",
        operation_description="Удаление запрещено, если у поставщика есть приходы "
        "сырья — их каскадное удаление могло бы увести остаток склада в минус, "
        "если сырьё из них уже частично израсходовано.",
    ),
)
class SupplierModelViewSet(UltraModelViewSet):
    queryset = Supplier.objects.all()
    serializer_classes = {
        "list": SupplierSerializer,
        "retrieve": SupplierSerializer,
        "create": SupplierSerializer,
        "update": SupplierSerializer,
    }
    filter_backends = [OrderingFilter, SearchFilter]
    search_fields = ["name", "tel"]
    ordering_fields = ["name"]

    permission_classes_by_action = {
        "list": [IsAuthenticated],
        "retrieve": [IsAuthenticated],
        "create": [IsAuthenticated],
        "update": [IsAuthenticated],
        "destroy": [IsAuthenticated],
    }

    def get_queryset(self):
        return super().get_queryset().filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)

    def perform_destroy(self, instance):
        transactions = instance.transactions_ingredient.count()
        if transactions:
            raise ValidationError(
                f"Нельзя удалить поставщика: по нему есть приходы сырья "
                f"({transactions})."
            )
        super().perform_destroy(instance)
