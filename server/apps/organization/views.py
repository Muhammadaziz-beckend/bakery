from django.utils.decorators import method_decorator
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi

from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView

from utils.mixins import RequireOrganizationMixin
from .serializers import OrganizationSettingsSerializer, OrganizationLogoSerializer


@method_decorator(
    name="get",
    decorator=swagger_auto_schema(
        operation_summary="Настройки моей организации",
        operation_description="Возвращает организацию текущего пользователя. "
        "Каждый пользователь видит и редактирует только свою организацию — "
        "она берётся из request.user.organization, id в URL не передаётся.",
    ),
)
@method_decorator(
    name="put",
    decorator=swagger_auto_schema(operation_summary="Обновить настройки организации"),
)
@method_decorator(
    name="patch",
    decorator=swagger_auto_schema(
        operation_summary="Частично обновить настройки организации"
    ),
)
class OrganizationSettingsView(RequireOrganizationMixin, RetrieveUpdateAPIView):
    """Название, адрес и ссылка на адрес организации текущего пользователя.
    Логотип грузится отдельно — см. OrganizationLogoView."""

    serializer_class = OrganizationSettingsSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user.organization


class OrganizationLogoView(RequireOrganizationMixin, APIView):
    """Загрузка/удаление логотипа организации текущего пользователя.
    Отдельный маршрут по тому же принципу, что и upload-image у товара —
    multipart-запрос с файлом `logo`."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @swagger_auto_schema(
        operation_summary="Загрузить/заменить логотип организации",
        manual_parameters=[
            openapi.Parameter(
                "logo",
                openapi.IN_FORM,
                description="Файл изображения",
                type=openapi.TYPE_FILE,
                required=True,
            ),
        ],
        responses={200: OrganizationLogoSerializer, 400: "Файл не передан"},
    )
    def post(self, request, *args, **kwargs):
        organization = request.user.organization

        if "logo" not in request.data:
            raise ValidationError({"logo": "Файл не передан."})

        serializer = OrganizationLogoSerializer(
            organization, data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @swagger_auto_schema(operation_summary="Удалить логотип организации")
    def delete(self, request, *args, **kwargs):
        organization = request.user.organization
        organization.logo.delete(save=True)
        return Response(
            OrganizationLogoSerializer(organization, context={"request": request}).data
        )
