from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.exceptions import NotFound
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.organization.models import Organization
from apps.warehouse.models import Category, Product
from utils.paginations import pagination_dynamic

from ..serializers import PublicCategoryTreeSerializer, PublicOrganizationSerializer, PublicProductSerializer


class PublicOrganizationResolveView(APIView):
    """Определяет организацию по домену/поддомену запроса — чтобы
    client_web мог на старте понять, чью витрину показывать, если сайт
    открыт по кастомному домену пекарни или её поддомену вместо общего
    каталога `/organizations/`. Хост передаётся явно параметром `host`
    (реальный домен браузера, а не хост запроса к API), либо, если он не
    передан, берётся Host-заголовок самого запроса."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, *args, **kwargs):
        host = request.query_params.get("host") or request.get_host()
        organization = Organization.resolve_by_host(host)
        if organization is None:
            raise NotFound("Организация для этого домена не найдена.")
        serializer = PublicOrganizationSerializer(
            organization, context={"request": request}
        )
        return Response(serializer.data)


class PublicOrganizationListView(ListAPIView):
    """Публичная директория пекарен — для главной страницы client_web, где
    покупатель выбирает, к какой организации перейти."""

    queryset = Organization.objects.filter(is_active=True).order_by("name")
    serializer_class = PublicOrganizationSerializer
    permission_classes = [AllowAny]
    authentication_classes = []
    pagination_class = None


class PublicOrganizationDetailView(RetrieveAPIView):
    """Карточка одной организации — для шапки client_web, где после выбора
    пекарни на / логотип, название и адрес нужно показать в хедере."""

    queryset = Organization.objects.filter(is_active=True)
    serializer_class = PublicOrganizationSerializer
    permission_classes = [AllowAny]
    authentication_classes = []


class PublicCategoryTreeView(APIView):
    """Дерево категорий одной организации — публичный аналог
    CategoryModelViewSet.tree, без авторизации и без products_count."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, organization_id, *args, **kwargs):
        roots = Category.objects.filter(
            organization_id=organization_id, parent__isnull=True
        )
        serializer = PublicCategoryTreeSerializer(
            roots, many=True, context={"request": request}
        )
        return Response(serializer.data)


class PublicProductListView(ListAPIView):
    serializer_class = PublicProductSerializer
    permission_classes = [AllowAny]
    authentication_classes = []
    pagination_class = pagination_dynamic(24)
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["category"]

    def get_queryset(self):
        return (
            Product.objects.filter(
                organization_id=self.kwargs["organization_id"],
                is_semi_finished_product=False,
            )
            .select_related("category")
            .prefetch_related("variants")
            .order_by("name")
        )


class PublicProductDetailView(RetrieveAPIView):
    serializer_class = PublicProductSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_queryset(self):
        return (
            Product.objects.filter(
                organization_id=self.kwargs["organization_id"],
                is_semi_finished_product=False,
            )
            .select_related("category")
            .prefetch_related("variants")
        )
