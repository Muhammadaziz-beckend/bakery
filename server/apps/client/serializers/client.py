from rest_framework import serializers

from ..models import Client


class ClientSerializer(serializers.ModelSerializer):
    orders_count = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = ("id", "name", "last_name", "tel", "orders_count")

    def get_orders_count(self, obj):
        return obj.orders.count()
