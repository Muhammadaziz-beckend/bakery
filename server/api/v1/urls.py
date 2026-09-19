from django.urls import path, include
from rest_framework.routers import DefaultRouter

from rest_framework.authtoken.views import obtain_auth_token
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from django.conf import settings

from apps.account.views.auth import Login, Me
from apps.account.views.profile import ProfileView, AvatarView, ChangePasswordView
from apps.organization.views import OrganizationSettingsView, OrganizationLogoView
from apps.debt.views import DebtFromSupplierModelViewSet
from apps.production.views import ProductProductionModelViewSet, ReportView
from apps.client.views import ClientModelViewSet
from apps.order.views import OrderModelViewSet, ProductOrderLimitOverrideModelViewSet
from apps.warehouse.views import (
    ProductModelViewSet,
    ProductVariantModelViewSet,
    CategoryModelViewSet,
    IngredientModelViewSet,
    UnitModelViewSet,
    SupplierModelViewSet,
    TransactionIngredientModelViewSet,
)

router = DefaultRouter()
router.register("production",ProductProductionModelViewSet)
router.register("product",ProductModelViewSet)
router.register("product-variant",ProductVariantModelViewSet)
router.register("category",CategoryModelViewSet)
router.register("ingredient",IngredientModelViewSet)
router.register("unit",UnitModelViewSet)
router.register("supplier",SupplierModelViewSet)
router.register("transaction-ingredient",TransactionIngredientModelViewSet)
router.register("debt",DebtFromSupplierModelViewSet, basename="debt")
router.register("client",ClientModelViewSet, basename="client")
router.register("order",OrderModelViewSet, basename="order")
router.register(
    "order-limit-override",
    ProductOrderLimitOverrideModelViewSet,
    basename="order-limit-override",
)

urlpatterns = [

    #
    path("", include(router.urls)),
    path("auth/me/", Me.as_view()),
    path("auth/profile/", ProfileView.as_view()),
    path("auth/profile/avatar/", AvatarView.as_view()),
    path("auth/change-password/", ChangePasswordView.as_view()),
    path("organization/", OrganizationSettingsView.as_view()),
    path("organization/logo/", OrganizationLogoView.as_view()),
    path("report/", ReportView.as_view()),
    path("public/", include("apps.storefront.urls")),
]


if settings.AUTH_MODE in ("jwt", "both"):
    urlpatterns += [
        path("auth/jwt/login/", TokenObtainPairView.as_view()),
        path("auth/jwt/refresh/", TokenRefreshView.as_view()),
    ]

if settings.AUTH_MODE in ("token", "both"):
    urlpatterns += [ path("auth/login/", Login.as_view(), name="login"),]