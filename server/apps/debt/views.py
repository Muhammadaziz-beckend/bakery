from django.db import transaction
from django.utils.decorators import method_decorator
from django_filters.rest_framework import DjangoFilterBackend
from drf_yasg.utils import swagger_auto_schema

from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from utils.mixins import UltraModelViewSet
from utils.paginations import pagination_dynamic

from .models import DebtFromSupplier
from .serializers import (
    DebtFromSupplierListSerializer,
    DebtFromSupplierRetrieveSerializer,
    DebtFromSupplierCreateSerializer,
    DebtRepaymentSerializer,
)


@method_decorator(
    name="list",
    decorator=swagger_auto_schema(
        operation_summary="Список долгов перед поставщиками",
        operation_description="Возвращает долги только организации текущего "
        "пользователя (через supplier__organization).",
    ),
)
@method_decorator(
    name="retrieve",
    decorator=swagger_auto_schema(
        operation_summary="Получить долг",
        operation_description="Вместе с историей погашений (`repayment_amounts`).",
    ),
)
@method_decorator(
    name="create",
    decorator=swagger_auto_schema(
        operation_summary="Зафиксировать новый долг перед поставщиком"
    ),
)
@method_decorator(
    name="destroy",
    decorator=swagger_auto_schema(
        operation_summary="Удалить долг",
        operation_description="Удаление запрещено, если по долгу уже есть "
        "погашения — их каскадное удаление стёрло бы историю платежей.",
    ),
)
class DebtFromSupplierModelViewSet(UltraModelViewSet):
    """Долги перед поставщиками. У DebtFromSupplier нет своего поля
    organization (см. apps/debt/models/supplier.py) — принадлежность к
    организации определяется через supplier.organization, поэтому каждый
    пользователь видит и может изменять долги только своих поставщиков."""

    serializer_classes = {
        "list": DebtFromSupplierListSerializer,
        "retrieve": DebtFromSupplierRetrieveSerializer,
        "create": DebtFromSupplierCreateSerializer,
    }
    filter_backends = [OrderingFilter, DjangoFilterBackend, SearchFilter]
    search_fields = ["supplier__name", "supplier__tel"]
    ordering_fields = ["duty", "paid_off", "create_dt"]
    filterset_fields = ["supplier", "is_paid_off"]

    pagination_class = pagination_dynamic(12)

    permission_classes_by_action = {
        "list": [IsAuthenticated],
        "retrieve": [IsAuthenticated],
        "create": [IsAuthenticated],
        "destroy": [IsAuthenticated],
        "add_repayment": [IsAuthenticated],
    }

    def get_queryset(self):
        return (
            DebtFromSupplier.objects.filter(
                supplier__organization=self.request.user.organization
            )
            .select_related("supplier")
            .prefetch_related("repayment_amounts")
            .order_by("-create_dt")
        )

    def perform_destroy(self, instance):
        repayments = instance.repayment_amounts.count()
        if repayments:
            raise ValidationError(
                f"Нельзя удалить долг: по нему уже есть погашения ({repayments})."
            )
        super().perform_destroy(instance)

    @swagger_auto_schema(
        method="post",
        operation_summary="Погасить часть долга",
        operation_description="Добавляет запись о погашении и увеличивает "
        "`paid_off`. Когда `paid_off` достигает суммы долга, `is_paid_off` "
        "выставляется автоматически (см. DebtFromSupplier.save()).",
        request_body=DebtRepaymentSerializer,
        responses={200: DebtFromSupplierRetrieveSerializer, 400: "Некорректная сумма"},
    )
    @action(
        methods=["post"],
        detail=True,
        url_path="add-repayment",
        url_name="add-repayment",
    )
    def add_repayment(self, request, *args, **kwargs):
        debt = self.get_object()

        amount_serializer = DebtRepaymentSerializer(data=request.data)
        amount_serializer.is_valid(raise_exception=True)
        amount = amount_serializer.validated_data["repayment_amount"]

        # select_for_update + пересчёт remaining внутри транзакции — без этого
        # два одновременных погашения оба читают один и тот же "старый"
        # paid_off, оба проходят проверку остатка, и второй save() затирает
        # прибавку первого (потерянное обновление под конкурентной нагрузкой)
        with transaction.atomic():
            debt = DebtFromSupplier.objects.select_for_update().get(pk=debt.pk)

            remaining = debt.duty - debt.paid_off
            if amount > remaining:
                raise ValidationError(
                    {
                        "repayment_amount": f"Сумма превышает остаток долга ({remaining})."
                    }
                )

            amount_serializer.save(debt=debt)
            debt.paid_off = debt.paid_off + amount
            debt.save()

        # get_object() выше уже выполнил prefetch_related("repayment_amounts") —
        # без сброса кэша только что созданное погашение не попало бы в ответ.
        debt.refresh_from_db()

        context = self.get_serializer_context()
        return Response(
            DebtFromSupplierRetrieveSerializer(debt, context=context).data
        )
