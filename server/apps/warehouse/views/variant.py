from django.utils.decorators import method_decorator
from drf_yasg.utils import swagger_auto_schema
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from apps.warehouse.serializers import ProductVariantSerializer
from utils.mixins import UltraModelViewSet
from utils.paginations import pagination_dynamic
from ..models import ProductVariant


@method_decorator(
    name="list",
    decorator=swagger_auto_schema(
        operation_summary="Список вариантов товара",
        operation_description="Фильтруется по `?product=<id>`, чтобы получить все "
        "варианты (размеры) конкретного товара.",
    ),
)
@method_decorator(
    name="retrieve",
    decorator=swagger_auto_schema(operation_summary="Получить вариант товара"),
)
@method_decorator(
    name="create",
    decorator=swagger_auto_schema(
        operation_summary="Создать вариант товара",
        operation_description="Добавляет новый вариант (размер) к уже существующему "
        "товару — `product` обязателен. Необязательное поле `consumptions` задаёт "
        "рецептуру именно этого варианта.",
    ),
)
@method_decorator(
    name="update",
    decorator=swagger_auto_schema(
        operation_summary="Обновить вариант товара",
        operation_description="Меняет название/цену/себестоимость. Переданный список "
        "`consumptions` целиком заменяет рецептуру варианта. Остаток на складе "
        "(`count_in_warehouse`) этим маршрутом не редактируется — он меняется только "
        "через приход производства или продажу партий.",
    ),
)
@method_decorator(
    name="partial_update",
    decorator=swagger_auto_schema(operation_summary="Частично обновить вариант товара"),
)
@method_decorator(
    name="destroy",
    decorator=swagger_auto_schema(
        operation_summary="Удалить вариант товара",
        operation_description="Удаление запрещено, если по этому варианту уже есть "
        "партии производства.",
    ),
)
class ProductVariantModelViewSet(UltraModelViewSet):
    queryset = ProductVariant.objects.select_related("product").prefetch_related(
        "consumptions__ingredient__unit"
    )
    serializer_classes = {
        "list": ProductVariantSerializer,
        "retrieve": ProductVariantSerializer,
        "create": ProductVariantSerializer,
        "update": ProductVariantSerializer,
    }
    filter_backends = [OrderingFilter, DjangoFilterBackend]
    ordering_fields = ["name", "price"]
    filterset_fields = ["product"]

    # ProductVariant — полноценная запись (своя цена, остаток, история
    # производства), а не маленький справочник вроде Category/Ingredient/Unit —
    # поэтому, как и Product/ProductProduction, отдаём списком с пагинацией,
    # а не всё разом.
    pagination_class = pagination_dynamic(50)

    permission_classes_by_action = {
        "list": [IsAuthenticated],
        "retrieve": [IsAuthenticated],
        "create": [IsAuthenticated],
        "update": [IsAuthenticated],
        "destroy": [IsAuthenticated],
    }

    def get_queryset(self):
        # ProductVariant не хранит organization сам — принадлежность через product
        return super().get_queryset().filter(product__organization=self.request.user.organization)

    def perform_destroy(self, instance):
        # ProductProduction.variant объявлен с on_delete=CASCADE — без проверки
        # удаление варианта молча снесло бы всю историю его партий производства
        productions = instance.productions.count()
        if productions:
            raise ValidationError(
                f"Нельзя удалить вариант: по нему есть партии производства "
                f"({productions})."
            )
        super().perform_destroy(instance)
