from rest_framework.permissions import IsAuthenticated,AllowAny
# filter
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import (
    SearchFilter,
    OrderingFilter,
)
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status

from django.utils.decorators import method_decorator
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi

from apps.warehouse.serializers import (
    ListProductSerializer,
    RetrieveProductSerializer,
    CreateProductWithConsumptionsSerializer,
    ProductImageSerializer,
)
from utils.mixins import UltraModelViewSet
from utils.paginations import pagination_dynamic
from ..models import Product


@method_decorator(
    name="list",
    decorator=swagger_auto_schema(
        operation_summary="Список продуктов",
        operation_description="Возвращает постраничный список продуктов склада с поддержкой поиска и сортировки.",
    ),
)
@method_decorator(
    name="retrieve",
    decorator=swagger_auto_schema(
        operation_summary="Получить продукт",
        operation_description="Возвращает один продукт по его id вместе с рецептурой "
        "(`consumptions`) и деталями ингредиентов.",
    ),
)
@method_decorator(
    name="create",
    decorator=swagger_auto_schema(
        operation_summary="Создать продукт (можно сразу с рецептурой)",
        operation_description="Создаёт продукт. Необязательное поле `consumptions` "
        "принимает список расходов ингредиентов — они создаются в той же транзакции.",
    ),
)
@method_decorator(
    name="update",
    decorator=swagger_auto_schema(
        operation_summary="Обновить продукт",
        operation_description="Полностью обновляет продукт. Переданный список "
        "`consumptions` целиком заменяет текущую рецептуру.",
    ),
)
@method_decorator(
    name="partial_update",
    decorator=swagger_auto_schema(
        operation_summary="Частично обновить продукт",
        operation_description="Обновляет только переданные поля продукта. Если передан "
        "`consumptions` — рецептура заменяется целиком; если поля нет в запросе — "
        "рецептура остаётся без изменений.",
    ),
)
@method_decorator(
    name="destroy",
    decorator=swagger_auto_schema(
        operation_summary="Удалить продукт",
        operation_description="Удаление запрещено, если по продукту уже есть партии "
        "производства.",
    ),
)
class ProductModelViewSet(UltraModelViewSet):
    queryset = Product.objects.select_related("category").prefetch_related(
        "consumptions__ingredient__unit",
        "variants__consumptions__ingredient__unit",
    )
    serializer_classes = {
        "list": ListProductSerializer,
        "retrieve": RetrieveProductSerializer,
        "create": CreateProductWithConsumptionsSerializer,
        "update": CreateProductWithConsumptionsSerializer,
    }
    filter_backends = [
        OrderingFilter,
        DjangoFilterBackend,
        SearchFilter,
    ]
    search_fields = ["name"]
    ordering_fields = [
        "name",
        "price",
        "count_in_warehouse",
        "best_before_date",
    ]
    filterset_fields = ["category", "is_semi_finished_product"]

    pagination_class = pagination_dynamic(12)

    permission_classes_by_action = {
        "list": [IsAuthenticated],
        "retrieve": [IsAuthenticated],
        "create": [IsAuthenticated],
        "update": [IsAuthenticated],
        "destroy": [IsAuthenticated],
        "upload_image": [IsAuthenticated],
    }

    def get_queryset(self):
        return super().get_queryset().filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)

    def perform_destroy(self, instance):
        # ProductProduction.product объявлен с on_delete=CASCADE — без проверки
        # удаление товара молча снесло бы всю историю его партий производства
        productions = instance.productions.count()
        if productions:
            raise ValidationError(
                f"Нельзя удалить товар: по нему есть партии производства "
                f"({productions})."
            )
        super().perform_destroy(instance)

    @swagger_auto_schema(
        method="post",
        operation_summary="Создать продукт вместе с рецептурой (расходом ингредиентов)",
        operation_description=(
            "Создаёт продукт и одновременно один или несколько `ProductConsumption` "
            "(расход ингредиентов на единицу продукта) одной атомарной операцией. "
            "Поле `consumptions` необязательно и принимает список — можно передать "
            "как один, так и сразу несколько ингредиентов рецептуры.\n\n"
            "То же самое умеет обычный `POST /product/` — этот маршрут оставлен "
            "как явный псевдоним."
        ),
        request_body=CreateProductWithConsumptionsSerializer,
        responses={
            201: openapi.Response(
                description="Продукт и его рецептура успешно созданы",
                schema=CreateProductWithConsumptionsSerializer,
            ),
            400: "Ошибка валидации (например, некорректные поля продукта или ингредиента)",
            401: "Не передан токен авторизации",
        },
    )
    @action(
        methods=[
            "post",
        ],
        detail=False,
        url_path="create-with-consumptions",
        url_name="create-with-consumptions",
        permission_classes=[IsAuthenticated],
    )
    def create_consumption_and_product(self, request, *args, **kwargs):
        context = self.get_serializer_context()
        serializer = CreateProductWithConsumptionsSerializer(
            data=request.data, context=context
        )
        serializer.is_valid(raise_exception=True)
        product = serializer.save(organization=request.user.organization)

        return Response(
            CreateProductWithConsumptionsSerializer(product, context=context).data,
            status=status.HTTP_201_CREATED,
        )

    @swagger_auto_schema(
        method="post",
        operation_summary="Загрузить/заменить фото товара",
        operation_description="Принимает `multipart/form-data` с файлом `img`. "
        "Отдельный маршрут, а не поле в `create`/`update` — вложенный список "
        "`consumptions` нельзя передать через multipart, поэтому фото грузится "
        "своим запросом после того, как товар уже создан.",
        manual_parameters=[
            openapi.Parameter(
                "img",
                openapi.IN_FORM,
                description="Файл изображения",
                type=openapi.TYPE_FILE,
                required=True,
            ),
        ],
        responses={
            200: ProductImageSerializer,
            400: "Файл не передан или не является изображением",
        },
    )
    @swagger_auto_schema(
        method="delete",
        operation_summary="Удалить фото товара",
    )
    @action(
        methods=["post", "delete"],
        detail=True,
        url_path="upload-image",
        url_name="upload-image",
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_image(self, request, *args, **kwargs):
        product = self.get_object()
        context = self.get_serializer_context()

        if request.method == "DELETE":
            product.img.delete(save=True)
            return Response(ProductImageSerializer(product, context=context).data)

        if "img" not in request.data:
            raise ValidationError({"img": "Файл не передан."})

        serializer = ProductImageSerializer(product, data=request.data, context=context)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
