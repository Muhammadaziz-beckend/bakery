from datetime import date as date_cls

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils.decorators import method_decorator
from drf_yasg.utils import swagger_auto_schema
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from utils.mixins import UltraModelViewSet
from utils.paginations import pagination_dynamic
from utils.permissions import IsOrganizationOwner
from apps.warehouse.models import Product
from ..models import Order, ProductOrderLimitOverride
from ..services import get_effective_limit, get_ordered_count
from ..serializers import (
    ListOrderSerializer,
    RetrieveOrderSerializer,
    CreateOrderSerializer,
    UpdateOrderSerializer,
    ProductOrderLimitOverrideSerializer,
)


@method_decorator(
    name="list",
    decorator=swagger_auto_schema(operation_summary="Список заказов"),
)
@method_decorator(
    name="retrieve",
    decorator=swagger_auto_schema(
        operation_summary="Получить заказ",
        operation_description="Заказ вместе со всеми его позициями (`items`) — "
        "какой товар и сколько было заказано.",
    ),
)
@method_decorator(
    name="create",
    decorator=swagger_auto_schema(
        operation_summary="Оформить заказ",
        operation_description=(
            "Создаёт заказ клиента с одной или несколькими позициями (`items`: "
            "`product` + `count`) одной атомарной операцией. `total_prise` "
            "считается автоматически: у каждой позиции — `product.price * count`, "
            "у заказа — сумма позиций. Если заказ создаётся сразу со статусом "
            "`done`, товар сразу списывается со склада."
        ),
    ),
)
@method_decorator(
    name="update",
    decorator=swagger_auto_schema(
        operation_summary="Обновить заказ",
        operation_description=(
            "Обновляет статус/оплату/способ получения заказа. Переданный список "
            "`items` целиком заменяет текущие позиции; если ключа нет в запросе — "
            "позиции остаются без изменений. Перевод статуса в `done` списывает "
            "товар со склада, перевод из `done` в любой другой статус (например "
            "`returned` — возврат) — возвращает его обратно."
        ),
    ),
)
@method_decorator(
    name="partial_update",
    decorator=swagger_auto_schema(
        operation_summary="Частично обновить заказ",
        operation_description="Как `update`, но можно передать только "
        "изменившиеся поля.",
    ),
)
@method_decorator(
    name="destroy",
    decorator=swagger_auto_schema(
        operation_summary="Удалить заказ",
        operation_description="Удаляет заказ вместе с его позициями. Если товар "
        "по каким-то позициям уже был списан со склада (заказ был в статусе "
        "`done`), он автоматически возвращается обратно.",
    ),
)
class OrderModelViewSet(UltraModelViewSet):
    queryset = Order.objects.select_related("client").prefetch_related(
        "items__product"
    )
    serializer_classes = {
        "list": ListOrderSerializer,
        "retrieve": RetrieveOrderSerializer,
        "create": CreateOrderSerializer,
        "update": UpdateOrderSerializer,
    }
    filter_backends = [OrderingFilter, DjangoFilterBackend, SearchFilter]
    search_fields = ["client__name", "client__last_name", "client__tel"]
    ordering_fields = ["create_dt", "total_prise"]
    filterset_fields = ["client", "status", "payment_status", "receipt_method"]

    pagination_class = pagination_dynamic(12)

    permission_classes_by_action = {
        "list": [IsAuthenticated],
        "retrieve": [IsAuthenticated],
        "create": [IsAuthenticated],
        "update": [IsAuthenticated],
        "destroy": [IsAuthenticated],
        "availability": [IsAuthenticated],
    }

    def get_queryset(self):
        return super().get_queryset().filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                serializer.save(organization=self.request.user.organization)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            raise DRFValidationError(detail)

    def perform_update(self, serializer):
        try:
            with transaction.atomic():
                serializer.save()
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            raise DRFValidationError(detail)

    def perform_destroy(self, instance):
        try:
            with transaction.atomic():
                super().perform_destroy(instance)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            raise DRFValidationError(detail)

    @swagger_auto_schema(
        operation_summary="Доступность товаров на дату",
        operation_description=(
            "Дневной лимит, сколько уже заказано и сколько ещё доступно по "
            "каждому товару организации на переданную `date` (YYYY-MM-DD). "
            "`limit: 0` значит лимита нет вовсе (`remaining: null`). "
            "Используется на форме заказа, чтобы показать, что дата уже "
            "занята, до попытки сохранить заказ."
        ),
    )
    @action(detail=False, methods=["get"], url_path="availability")
    def availability(self, request):
        date_str = request.query_params.get("date")
        if not date_str:
            raise DRFValidationError({"date": "Параметр date обязателен (YYYY-MM-DD)."})
        try:
            order_date = date_cls.fromisoformat(date_str)
        except ValueError:
            raise DRFValidationError(
                {"date": "Некорректная дата — используйте формат YYYY-MM-DD."}
            )

        products = Product.objects.filter(organization=request.user.organization)
        results = []
        for product in products:
            limit = get_effective_limit(product, order_date)
            used = get_ordered_count(product, order_date)
            results.append(
                {
                    "product": product.pk,
                    "product_name": product.name,
                    "limit": limit,
                    "used": used,
                    "remaining": None if limit == 0 else max(limit - used, 0),
                    "is_full": limit != 0 and used >= limit,
                }
            )

        return Response({"date": date_str, "results": results})


@method_decorator(
    name="list",
    decorator=swagger_auto_schema(operation_summary="Список особых лимитов на дату"),
)
@method_decorator(
    name="create",
    decorator=swagger_auto_schema(
        operation_summary="Задать особый лимит на дату",
        operation_description="Переопределяет Product.daily_order_limit для "
        "одного товара на конкретную дату (напр. Новый год). Доступно "
        "только владельцу организации.",
    ),
)
class ProductOrderLimitOverrideModelViewSet(UltraModelViewSet):
    queryset = ProductOrderLimitOverride.objects.select_related("product")
    serializer_class = ProductOrderLimitOverrideSerializer
    filter_backends = [OrderingFilter, DjangoFilterBackend]
    ordering_fields = ["date"]
    filterset_fields = ["product", "date"]

    permission_classes_by_action = {
        "list": [IsAuthenticated],
        "retrieve": [IsAuthenticated],
        "create": [IsOrganizationOwner],
        "update": [IsOrganizationOwner],
        "destroy": [IsOrganizationOwner],
    }

    def get_queryset(self):
        return super().get_queryset().filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                serializer.save(organization=self.request.user.organization)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            raise DRFValidationError(detail)
