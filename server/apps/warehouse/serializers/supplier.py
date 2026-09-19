from rest_framework import serializers

from ..models import Supplier


class SupplierSerializer(serializers.ModelSerializer):

    class Meta:
        model = Supplier
        fields = ("id", "name", "tel")

    def validate_tel(self, value):
        # уникальность в рамках организации (UniqueConstraint на модели), а
        # не глобально — поле больше не unique=True на модели
        request = self.context.get("request")
        if request:
            qs = Supplier.objects.filter(
                organization=request.user.organization, tel=value
            )
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    "Поставщик с таким номером телефона уже существует."
                )
        return value
