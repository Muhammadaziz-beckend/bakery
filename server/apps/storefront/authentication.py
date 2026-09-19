from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from .models import CustomerToken


class CustomerTokenAuthentication(BaseAuthentication):
    """Токен-аутентификация покупателей витрины. Использует тот же заголовок
    `Authorization: Token <key>`, что и rest_framework.authtoken.TokenAuthentication
    у сотрудников — чтобы client_web мог переиспользовать без изменений те же
    Get/Post/Patch/Del хелперы (src/utils/routes/), что и админка (web),
    просто указывая свой токен. Токены при этом из разных таблиц (CustomerToken
    вместо authtoken.Token) и ни на одном публичном эндпоинте не смешиваются с
    аутентификацией сотрудников — там explicit `authentication_classes`."""

    keyword = "Token"

    def authenticate(self, request):
        auth = get_authorization_header(request).split()
        if not auth or auth[0].lower() != self.keyword.lower().encode():
            return None
        if len(auth) != 2:
            raise AuthenticationFailed("Неверный заголовок авторизации.")

        try:
            key = auth[1].decode()
        except UnicodeDecodeError:
            raise AuthenticationFailed("Неверный заголовок авторизации.")

        try:
            token = CustomerToken.objects.select_related("customer").get(key=key)
        except CustomerToken.DoesNotExist:
            raise AuthenticationFailed("Неверный токен.")

        return (token.customer, token)

    def authenticate_header(self, request):
        return self.keyword
