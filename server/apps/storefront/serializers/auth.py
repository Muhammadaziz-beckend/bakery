from rest_framework import serializers

from ..models import CustomerAccount


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = CustomerAccount
        fields = ("id", "phone", "password", "name", "last_name")

    def validate_phone(self, value):
        if CustomerAccount.objects.filter(phone=value).exists():
            raise serializers.ValidationError("Этот номер телефона уже зарегистрирован.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        account = CustomerAccount(**validated_data)
        account.set_password(password)
        account.save()
        return account


class LoginSerializer(serializers.Serializer):
    phone = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        try:
            account = CustomerAccount.objects.get(phone=attrs["phone"])
        except CustomerAccount.DoesNotExist:
            raise serializers.ValidationError("Неверный телефон или пароль.")

        if not account.check_password(attrs["password"]):
            raise serializers.ValidationError("Неверный телефон или пароль.")

        attrs["account"] = account
        return attrs


class CustomerProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerAccount
        fields = ("id", "phone", "name", "last_name")
        read_only_fields = ("id", "phone")
