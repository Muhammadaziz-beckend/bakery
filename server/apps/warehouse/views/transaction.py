from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.decorators import method_decorator
from drf_yasg.utils import swagger_auto_schema
from rest_framework import mixins, viewsets
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from apps.warehouse.serializers import (
    ListTransactionIngredientSerializer,
    RetrieveTransactionIngredientSerializer,
    CreateTransactionIngredientSerializer,
)
from utils.mixins import (
    PermissionByActionMixin,
    SerializeByActionMixin,
    RequireOrganizationMixin,
)
from ..models import TransactionIngredient


@method_decorator(
    name="list",
    decorator=swagger_auto_schema(
        operation_summary="Список приходов сырья",
        operation_description="История поступлений сырья от поставщиков.",
    ),
)
@method_decorator(
    name="retrieve",
    decorator=swagger_auto_schema(
        operation_summary="Получить приход",
        operation_description="Приход вместе со всеми его позициями "
        "(`items`) — какой ингредиент и сколько было получено.",
    ),
)
@method_decorator(
    name="create",
    decorator=swagger_auto_schema(
        operation_summary="Оформить приход сырья",
        operation_description=(
            "Создаёт приход от поставщика с одной или несколькими позициями "
            "(`items`: `ingredient` + `count`) одной атомарной операцией — "
            "остаток каждого ингредиента на складе увеличивается сразу. "
            "Это единственный способ пополнить остаток: прямое редактирование "
            "`count_in_warehouse` через `PATCH /ingredient/:id/` не поддерживается."
        ),
    ),
)
@method_decorator(
    name="destroy",
    decorator=swagger_auto_schema(
        operation_summary="Удалить приход",
        operation_description="Отменяет приход и откатывает остаток склада. "
        "Запрещено, если сырьё из этого прихода уже частично израсходовано.",
    ),
)
class TransactionIngredientModelViewSet(
    RequireOrganizationMixin,
    PermissionByActionMixin,
    SerializeByActionMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Приход сырья — история пополнений; редактирование (`update`) намеренно
    не поддерживается: у прихода можно либо добавить новую запись, либо
    удалить существующую (см. `perform_destroy` и сигналы в
    `apps/warehouse/signals/transactionIngredient.py`)."""

    queryset = TransactionIngredient.objects.select_related("suppler").prefetch_related(
        "transaction_items__ingredient__unit"
    )
    serializer_classes = {
        "list": ListTransactionIngredientSerializer,
        "retrieve": RetrieveTransactionIngredientSerializer,
        "create": CreateTransactionIngredientSerializer,
    }
    filter_backends = [OrderingFilter, DjangoFilterBackend]
    ordering_fields = ["create_dt"]
    filterset_fields = ["suppler"]

    permission_classes_by_action = {
        "list": [IsAuthenticated],
        "retrieve": [IsAuthenticated],
        "create": [IsAuthenticated],
        "destroy": [IsAuthenticated],
    }

    def get_queryset(self):
        return super().get_queryset().filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        try:
            serializer.save(organization=self.request.user.organization)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            raise DRFValidationError(detail)

    def perform_destroy(self, instance):
        # удаление каскадом сносит transaction_items, а их post_delete-сигнал
        # откатывает остаток на складе и сам может поднять ValidationError,
        # если сырьё из прихода уже частично израсходовано — без перевода
        # это была бы голая 500-я
        try:
            super().perform_destroy(instance)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            raise DRFValidationError(detail)
