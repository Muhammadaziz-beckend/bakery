from django.urls import path

from .views.auth import LoginView, MeView, RegisterView
from .views.catalog import (
    PublicCategoryTreeView,
    PublicOrganizationDetailView,
    PublicOrganizationListView,
    PublicOrganizationResolveView,
    PublicProductDetailView,
    PublicProductListView,
)
from .views.orders import PublicOrderDetailView, PublicOrderListCreateView

urlpatterns = [
    path("auth/register/", RegisterView.as_view()),
    path("auth/login/", LoginView.as_view()),
    path("auth/me/", MeView.as_view()),
    path("organizations/", PublicOrganizationListView.as_view()),
    path("organizations/resolve/", PublicOrganizationResolveView.as_view()),
    path("organizations/<int:pk>/", PublicOrganizationDetailView.as_view()),
    path(
        "organizations/<int:organization_id>/categories/",
        PublicCategoryTreeView.as_view(),
    ),
    path(
        "organizations/<int:organization_id>/products/",
        PublicProductListView.as_view(),
    ),
    path(
        "organizations/<int:organization_id>/products/<int:pk>/",
        PublicProductDetailView.as_view(),
    ),
    path("orders/", PublicOrderListCreateView.as_view()),
    path("orders/<int:pk>/", PublicOrderDetailView.as_view()),
]
