from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.order.models import Order
from utils.paginations import pagination_dynamic

from ..authentication import CustomerTokenAuthentication
from ..serializers import (
    PublicCreateOrderSerializer,
    PublicOrderDetailSerializer,
    PublicOrderListSerializer,
)


class PublicOrderListCreateView(generics.ListCreateAPIView):
    """История заказов покупателя (across всех организаций, где он заказывал)
    + оформление нового заказа."""

    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAuthenticated]
    pagination_class = pagination_dynamic(10)

    def get_serializer_class(self):
        if self.request.method == "POST":
            return PublicCreateOrderSerializer
        return PublicOrderListSerializer

    def get_queryset(self):
        return (
            Order.objects.filter(client__customer_account=self.request.user)
            .select_related("organization", "client")
            .prefetch_related("items__product", "items__variant")
            .order_by("-create_dt")
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        return Response(
            PublicOrderDetailSerializer(order).data, status=status.HTTP_201_CREATED
        )


class PublicOrderDetailView(generics.RetrieveAPIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = PublicOrderDetailSerializer

    def get_queryset(self):
        return Order.objects.filter(
            client__customer_account=self.request.user
        ).select_related("organization", "client").prefetch_related(
            "items__product", "items__variant"
        )
