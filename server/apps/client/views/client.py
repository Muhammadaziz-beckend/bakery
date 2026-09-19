from django.utils.decorators import method_decorator
from drf_yasg.utils import swagger_auto_schema
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter

from utils.mixins import UltraModelViewSet
from ..models import Client
from ..serializers import ClientSerializer


@method_decorator(
    name="list",
    decorator=swagger_auto_schema(operation_summary="Список клиентов"),
)
@method_decorator(
    name="retrieve",
    decorator=swagger_auto_schema(operation_summary="Получить клиента"),
)
@method_decorator(
    name="create",
    decorator=swagger_auto_schema(operation_summary="Создать клиента"),
)
@method_decorator(
    name="update",
    decorator=swagger_auto_schema(operation_summary="Обновить клиента"),
)
@method_decorator(
    name="partial_update",
    decorator=swagger_auto_schema(operation_summary="Частично обновить клиента"),
)
@method_decorator(
    name="destroy",
    decorator=swagger_auto_schema(
        operation_summary="Удалить клиента",
        operation_description="Удаление запрещено, если у клиента есть заказы — их "
        "каскадное удаление стёрло бы историю заказов клиента.",
    ),
)
class ClientModelViewSet(UltraModelViewSet):
    serializer_classes = {
        "list": ClientSerializer,
        "retrieve": ClientSerializer,
        "create": ClientSerializer,
        "update": ClientSerializer,
    }
    filter_backends = [OrderingFilter, SearchFilter]
    search_fields = ["name", "last_name", "tel"]
    ordering_fields = ["name"]

    permission_classes_by_action = {
        "list": [IsAuthenticated],
        "retrieve": [IsAuthenticated],
        "create": [IsAuthenticated],
        "update": [IsAuthenticated],
        "destroy": [IsAuthenticated],
    }

    def get_queryset(self):
        return Client.objects.filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)

    def perform_destroy(self, instance):
        orders = instance.orders.count()
        if orders:
            raise ValidationError(
                f"Нельзя удалить клиента: по нему есть заказы ({orders})."
            )
        super().perform_destroy(instance)
