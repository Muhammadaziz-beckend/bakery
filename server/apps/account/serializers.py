from rest_framework import serializers
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils.translation import gettext_lazy as _
from rest_framework.authtoken.models import Token

from apps.organization.serializers import OrganizationBriefSerializer

User = get_user_model()


class AuthTokenSerializer(serializers.Serializer):
    phone = serializers.CharField(label=_("phone"), write_only=True)
    password = serializers.CharField(
        label=_("Password"),
        style={"input_type": "password"},
        trim_whitespace=False,
        write_only=True,
    )
    token = serializers.CharField(label=_("Token"), read_only=True)

    def validate(self, attrs):
        phone = attrs.get("phone")
        password = attrs.get("password")

        if phone and password:
            # Аутентификация пользователя
            user = authenticate(
                request=self.context.get("request"),
                phone=phone,  # Используем username
                password=password,
            )

            if not user:
                msg = _("Unable to log in with the provided credentials.")
                raise serializers.ValidationError(msg, code="authorization")
        else:
            msg = _('Must include "phone" and "password".')
            raise serializers.ValidationError(msg, code="authorization")

        # Проверка успешной аутентификации
        attrs["user"] = user
        return attrs

    def create(self, validated_data):
        """
        Генерация токена после успешной аутентификации.
        """
        user = validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        return {"token": token.key}


class MeSerializer(serializers.Serializer):
    """Текущий пользователь — организация нужна фронтенду для шапки
    (Navigation.jsx: лого и название вместо захардкоженных)."""

    id = serializers.IntegerField(read_only=True)
    phone = serializers.CharField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    is_owner = serializers.BooleanField(read_only=True)
    organization = OrganizationBriefSerializer(read_only=True)


class ProfileSerializer(serializers.ModelSerializer):
    """Профиль текущего пользователя (страница Settings.jsx). Телефон —
    логин пользователя, поэтому доступен только на чтение: смена телефона
    не входит в обычные настройки профиля. Аватар грузится отдельным
    multipart-запросом, см. AvatarSerializer."""

    class Meta:
        model = User
        fields = ("id", "phone", "first_name", "last_name", "email", "avatar")
        read_only_fields = ("id", "phone", "avatar")


class AvatarSerializer(serializers.ModelSerializer):
    """Отдельный сериализатор только для аватарки — принимает multipart с
    файлом (тот же приём, что и ProductImageSerializer у товара)."""

    class Meta:
        model = User
        fields = ("id", "avatar")


class ChangePasswordSerializer(serializers.Serializer):
    """Смена пароля текущего пользователя — старый пароль обязателен, чтобы
    сменить пароль мог только тот, кто уже знает текущий (а не просто
    залогиненная сессия/токен)."""

    old_password = serializers.CharField(
        label=_("Текущий пароль"),
        style={"input_type": "password"},
        trim_whitespace=False,
        write_only=True,
    )
    new_password = serializers.CharField(
        label=_("Новый пароль"),
        style={"input_type": "password"},
        trim_whitespace=False,
        write_only=True,
    )

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError(_("Неверный текущий пароль."))
        return value

    def validate_new_password(self, value):
        validate_password(value, user=self.context["request"].user)
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user