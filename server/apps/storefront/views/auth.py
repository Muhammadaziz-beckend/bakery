from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..authentication import CustomerTokenAuthentication
from ..models import CustomerToken
from ..serializers import CustomerProfileSerializer, LoginSerializer, RegisterSerializer


class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        account = serializer.save()
        token = CustomerToken.objects.create(customer=account)
        return Response(
            {"token": token.key, "customer": CustomerProfileSerializer(account).data},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        account = serializer.validated_data["account"]
        token, _ = CustomerToken.objects.get_or_create(customer=account)
        return Response(
            {"token": token.key, "customer": CustomerProfileSerializer(account).data}
        )


class MeView(generics.RetrieveUpdateAPIView):
    """Профиль покупателя — имя/фамилия редактируемы, телефон нет (это логин)."""

    serializer_class = CustomerProfileSerializer
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user
