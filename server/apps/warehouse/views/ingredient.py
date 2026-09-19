from django.db.models import ProtectedError
from django.utils.decorators import method_decorator
from drf_yasg.utils import swagger_auto_schema
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from apps.warehouse.serializers import (
    ListIngredientSerializer,
    RetrieveIngredientSerializer,
    CreateIngredientSerializer,
    UpdateIngredientSerializer,
    UnitSerializer,
)
from utils.mixins import UltraModelViewSet
from ..models import Ingredient, Unit


@method_decorator(
    name="list",
    decorator=swagger_auto_schema(
        operation_summary="Список ингредиентов",
        operation_description="Сырьё на складе: остаток, единица измерения, цена. "
        "Поле `is_below_limit` показывает, что остаток опустился до лимита "
        "предупреждения.",
    ),
)
@method_decorator(
    name="retrieve",
    decorator=swagger_auto_schema(operation_summary="Получить ингредиент"),
)
@method_decorator(
    name="create",
    decorator=swagger_auto_schema(
        operation_summary="Создать ингредиент",
        operation_description="`count_in_warehouse` здесь — стартовый остаток. "
        "После создания остаток меняется только через приход "
        "(`POST /transaction-ingredient/`) или расход на производство.",
    ),
)
@method_decorator(
    name="update",
    decorator=swagger_auto_schema(
        operation_summary="Обновить ингредиент",
        operation_description="Меняет только название/единицу/лимит/цену. Остаток "
        "склада этим маршрутом не редактируется — см. `POST /transaction-ingredient/`.",
    ),
)
@method_decorator(
    name="partial_update",
    decorator=swagger_auto_schema(operation_summary="Частично обновить ингредиент"),
)
@method_decorator(
    name="destroy",
    decorator=swagger_auto_schema(
        operation_summary="Удалить ингредиент",
        operation_description="Удаление запрещено, если ингредиент используется в "
        "рецептуре товаров или в приходных транзакциях.",
    ),
)
class IngredientModelViewSet(UltraModelViewSet):
    queryset = Ingredient.objects.select_related("unit")
    serializer_classes = {
        "list": ListIngredientSerializer,
        "retrieve": RetrieveIngredientSerializer,
        "create": CreateIngredientSerializer,
        "update": UpdateIngredientSerializer,
    }
    filter_backends = [OrderingFilter, DjangoFilterBackend, SearchFilter]
    search_fields = ["name"]
    ordering_fields = ["name", "count_in_warehouse", "price"]
    filterset_fields = ["unit"]

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
        # ProductConsumption.ingredient, ProductVariantConsumption.ingredient и
        # TransactionItemIngredient.ingredient — все CASCADE, поэтому удаление
        # ингредиента тихо вырезало бы его из рецептур товаров/вариантов и из
        # истории приходов
        used_in_recipes = instance.products.count()
        if used_in_recipes:
            raise ValidationError(
                f"Нельзя удалить ингредиент: он используется в рецептуре "
                f"товаров ({used_in_recipes})."
            )
        used_in_variant_recipes = instance.variant_consumptions.count()
        if used_in_variant_recipes:
            raise ValidationError(
                f"Нельзя удалить ингредиент: он используется в рецептуре "
                f"вариантов товаров ({used_in_variant_recipes})."
            )
        if instance.transaction_items.exists():
            raise ValidationError(
                "Нельзя удалить ингредиент: по нему есть приходные транзакции."
            )
        super().perform_destroy(instance)


@method_decorator(
    name="list",
    decorator=swagger_auto_schema(
        operation_summary="Список единиц измерения",
        operation_description="Справочник единиц измерения (кг, шт, л и т.д.) — "
        "нужен при создании ингредиента.",
    ),
)
@method_decorator(
    name="retrieve",
    decorator=swagger_auto_schema(operation_summary="Получить единицу измерения"),
)
@method_decorator(
    name="create",
    decorator=swagger_auto_schema(operation_summary="Создать единицу измерения"),
)
@method_decorator(
    name="update",
    decorator=swagger_auto_schema(operation_summary="Обновить единицу измерения"),
)
@method_decorator(
    name="partial_update",
    decorator=swagger_auto_schema(
        operation_summary="Частично обновить единицу измерения"
    ),
)
@method_decorator(
    name="destroy",
    decorator=swagger_auto_schema(operation_summary="Удалить единицу измерения"),
)
class UnitModelViewSet(UltraModelViewSet):
    queryset = Unit.objects.all()
    serializer_classes = {
        "list": UnitSerializer,
        "retrieve": UnitSerializer,
        "create": UnitSerializer,
        "update": UnitSerializer,
    }
    filter_backends = [OrderingFilter, SearchFilter]
    search_fields = ["name", "short_name"]
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
        # Ingredient.unit объявлен с on_delete=PROTECT — ProtectedError
        # прилетел бы 500-й, переводим в понятную 400-ю
        try:
            super().perform_destroy(instance)
        except ProtectedError:
            raise ValidationError(
                "Нельзя удалить единицу измерения: она используется ингредиентами."
            )
