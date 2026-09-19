from rest_framework.permissions import BasePermission


class IsOrganizationOwner(BasePermission):
    """Бизнес-роль владельца организации (User.is_owner) — не путать с
    is_staff/is_superuser (доступ в django-admin)."""

    message = "Действие доступно только владельцу организации."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_owner or user.is_superuser)
        )
