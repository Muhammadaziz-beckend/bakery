from django.utils.decorators import method_decorator
from drf_yasg.utils import swagger_auto_schema
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from apps.warehouse.serializers import (
    ListCategorySerializer,
    RetrieveCategorySerializer,
    CreateCategorySerializer,
    CategoryTreeSerializer,
)
from utils.mixins import UltraModelViewSet
from ..models import Category


@method_decorator(
    name="list",
    decorator=swagger_auto_schema(
        operation_summary="Список категорий (плоский)",
        operation_description="Плоский список категорий. Для иерархии используйте "
        "`GET /category/tree/`.",
    ),
)
@method_decorator(
    name="retrieve",
    decorator=swagger_auto_schema(operation_summary="Получить категорию"),
)
@method_decorator(
    name="create",
    decorator=swagger_auto_schema(
        operation_summary="Создать категорию",
        operation_description="Принимает multipart/form-data, если загружается `img`. "
        "`parent` — id родительской категории (необязательно).",
    ),
)
@method_decorator(
    name="update", decorator=swagger_auto_schema(operation_summary="Обновить категорию")
)
@method_decorator(
    name="partial_update",
    decorator=swagger_auto_schema(operation_summary="Частично обновить категорию"),
)
@method_decorator(
    name="destroy",
    decorator=swagger_auto_schema(
        operation_summary="Удалить категорию",
        operation_description="Удаление запрещено, если в категории есть товары или "
        "вложенные подкатегории — иначе они удалились бы каскадом.",
    ),
)
class CategoryModelViewSet(UltraModelViewSet):
    queryset = Category.objects.all()
    serializer_classes = {
        "list": ListCategorySerializer,
        "retrieve": RetrieveCategorySerializer,
        "create": CreateCategorySerializer,
        "update": CreateCategorySerializer,
    }
    filter_backends = [OrderingFilter, DjangoFilterBackend, SearchFilter]
    search_fields = ["name"]
    ordering_fields = ["name", "level"]
    filterset_fields = ["parent"]

    permission_classes_by_action = {
        "list": [IsAuthenticated],
        "tree": [IsAuthenticated],
        "retrieve": [IsAuthenticated],
        "create": [IsAuthenticated],
        "update": [IsAuthenticated],
        "destroy": [IsAuthenticated],
    }

    def get_queryset(self):
        return super().get_queryset().filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)

    @swagger_auto_schema(
        method="get",
        operation_summary="Дерево категорий",
        operation_description="Возвращает категории верхнего уровня с рекурсивно "
        "вложенными `children` (MPTT).",
        responses={200: CategoryTreeSerializer(many=True)},
    )
    @action(
        methods=["get"],
        detail=False,
        url_path="tree",
        url_name="tree",
        permission_classes=[IsAuthenticated],
    )
    def tree(self, request, *args, **kwargs):
        roots = Category.objects.filter(
            parent__isnull=True, organization=request.user.organization
        )
        serializer = CategoryTreeSerializer(
            roots, many=True, context=self.get_serializer_context()
        )
        return Response(serializer.data)

    def perform_destroy(self, instance):
        # Product.category и Category.parent объявлены с on_delete=CASCADE —
        # без этой проверки удаление категории молча снесло бы все её товары
        # и все подкатегории вместе с их товарами
        products = instance.products.count()
        children = instance.get_children().count()
        if products or children:
            parts = []
            if products:
                parts.append(f"товаров: {products}")
            if children:
                parts.append(f"подкатегорий: {children}")
            raise ValidationError(
                "Нельзя удалить категорию, в ней есть " + ", ".join(parts) + "."
            )
        super().perform_destroy(instance)
