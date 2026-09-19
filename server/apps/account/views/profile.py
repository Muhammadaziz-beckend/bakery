from django.utils.decorators import method_decorator
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi

from rest_framework.generics import RetrieveUpdateAPIView, GenericAPIView
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView
from rest_framework import status

from apps.account.serializers import (
    ProfileSerializer,
    AvatarSerializer,
    ChangePasswordSerializer,
)


@method_decorator(
    name="get",
    decorator=swagger_auto_schema(operation_summary="Профиль текущего пользователя"),
)
@method_decorator(
    name="put",
    decorator=swagger_auto_schema(operation_summary="Обновить профиль"),
)
@method_decorator(
    name="patch",
    decorator=swagger_auto_schema(operation_summary="Частично обновить профиль"),
)
class ProfileView(RetrieveUpdateAPIView):
    """Имя, фамилия и email текущего пользователя (страница Settings.jsx).
    Аватар грузится отдельно — см. AvatarView."""

    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class AvatarView(APIView):
    """Загрузка/удаление аватарки текущего пользователя — тот же приём, что
    и upload-image у товара: отдельный multipart-запрос с файлом `avatar`."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @swagger_auto_schema(
        operation_summary="Загрузить/заменить аватарку",
        manual_parameters=[
            openapi.Parameter(
                "avatar",
                openapi.IN_FORM,
                description="Файл изображения",
                type=openapi.TYPE_FILE,
                required=True,
            ),
        ],
        responses={200: AvatarSerializer, 400: "Файл не передан"},
    )
    def post(self, request, *args, **kwargs):
        user = request.user

        if "avatar" not in request.data:
            raise ValidationError({"avatar": "Файл не передан."})

        serializer = AvatarSerializer(
            user, data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @swagger_auto_schema(operation_summary="Удалить аватарку")
    def delete(self, request, *args, **kwargs):
        user = request.user
        user.avatar.delete(save=True)
        return Response(AvatarSerializer(user, context={"request": request}).data)


@method_decorator(
    name="post",
    decorator=swagger_auto_schema(
        operation_summary="Сменить пароль",
        operation_description="Требует текущий пароль. Новый пароль проверяется "
        "стандартными валидаторами Django (длина, схожесть с логином и т.п.).",
    ),
)
class ChangePasswordView(GenericAPIView):
    serializer_class = ChangePasswordSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "Пароль успешно изменён."}, status=status.HTTP_200_OK
        )
