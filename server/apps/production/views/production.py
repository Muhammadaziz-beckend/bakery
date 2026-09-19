from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import ProtectedError
from rest_framework.permissions import IsAuthenticated,AllowAny
from rest_framework.exceptions import ValidationError
# filter
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import (
    SearchFilter,
    OrderingFilter,
)

from apps.production.serializers import (
    CreateProductProduction,
    UpdateProductProduction,
    ListProductProduction,
    RetrieveProductProduction,
)
from utils.mixins import UltraModelViewSet
from utils.paginations import pagination_dynamic
from ..models import ProductProduction

class ProductProductionModelViewSet(UltraModelViewSet):
    queryset = ProductProduction.objects.select_related(
        "product", "variant"
    ).order_by("-is_sold")
    serializer_classes = {
        "list": ListProductProduction,
        "retrieve": RetrieveProductProduction,
        "create": CreateProductProduction,
        "update": UpdateProductProduction,
    }
    filter_backends = [
        OrderingFilter,
        DjangoFilterBackend,
        SearchFilter,
    ]
    filterset_fields = ["is_sold"]
    ordering_fields = [
        "best_before_date",
        "is_sold",
        "create_dt",
    ]
    
    pagination_class = pagination_dynamic(12)
    
    permission_classes_by_action = {
        "list": [IsAuthenticated],  # IsAuthenticated
        "retrieve": [IsAuthenticated],
        "create": [IsAuthenticated | IsAuthenticated],  # IsAdminUser
        "update": [IsAuthenticated],
        "destroy": [IsAuthenticated | IsAuthenticated],
    }

    def get_queryset(self):
        # ProductProduction не хранит organization сам — принадлежность через product
        return super().get_queryset().filter(product__organization=self.request.user.organization)

    def perform_destroy(self, instance):
        try:
            super().perform_destroy(instance)
        except ProtectedError:
            raise ValidationError(
                "Нельзя удалить партию — по ней уже есть проданные позиции."
            )
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            raise ValidationError(detail)
