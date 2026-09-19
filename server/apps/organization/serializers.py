from rest_framework import serializers

from .models import Organization


class OrganizationBriefSerializer(serializers.ModelSerializer):
    """Короткое представление организации — логотип и название для шапки
    фронтенда (Navigation.jsx)."""

    class Meta:
        model = Organization
        fields = ("id", "name", "logo")


class OrganizationSettingsSerializer(serializers.ModelSerializer):
    """Настройки организации (страница Settings.jsx на фронтенде). Логотип
    сюда не входит — грузится отдельным multipart-запросом, см.
    OrganizationLogoSerializer. `is_active` отдаётся только на чтение —
    активация организации не входит в самостоятельные настройки.

    `slug` и `custom_domain` управляют тем, по какому адресу открывается
    витрина этой организации — см. Organization.resolve_by_host."""

    class Meta:
        model = Organization
        fields = (
            "id",
            "name",
            "logo",
            "address",
            "address_link",
            "is_active",
            "slug",
            "custom_domain",
        )
        read_only_fields = ("id", "logo", "is_active")


class OrganizationLogoSerializer(serializers.ModelSerializer):
    """Отдельный сериализатор только для логотипа организации — принимает
    multipart с файлом (см. ProductImageSerializer — тот же приём)."""

    class Meta:
        model = Organization
        fields = ("id", "logo")
