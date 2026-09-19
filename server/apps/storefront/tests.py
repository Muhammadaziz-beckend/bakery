from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.organization.models import Organization
from apps.warehouse.models.product import Category, Product


class StorefrontFlowTests(TestCase):
    """Полный путь покупателя: регистрация -> вход -> каталог -> заказ ->
    история заказов. Гоняется на изолированной тестовой БД (никак не задевает
    реальные данные)."""

    @classmethod
    def setUpTestData(cls):
        cls.org = Organization.objects.create(
            name="Test bakery",
            address="Some street 1",
            address_link="https://maps.example/1",
            is_active=True,
        )
        cls.category = Category.objects.create(organization=cls.org, name="Cakes")
        cls.product = Product.objects.create(
            organization=cls.org,
            category=cls.category,
            name="Napoleon",
            price=Decimal("150"),
            cost_price=Decimal("70"),
            count_in_warehouse=Decimal("10"),
        )

    def setUp(self):
        self.client_api = APIClient()

    def test_public_organization_directory_lists_only_active(self):
        Organization.objects.create(
            name="Inactive bakery", address="—", address_link="https://x", is_active=False
        )
        res = self.client_api.get("/api/v1/public/organizations/")
        self.assertEqual(res.status_code, 200)
        names = [o["name"] for o in res.data]
        self.assertIn("Test bakery", names)
        self.assertNotIn("Inactive bakery", names)

    def test_public_catalog_hides_cost_price(self):
        res = self.client_api.get(
            f"/api/v1/public/organizations/{self.org.id}/products/"
        )
        self.assertEqual(res.status_code, 200)
        results = res.data["results"] if isinstance(res.data, dict) else res.data
        self.assertEqual(len(results), 1)
        self.assertNotIn("cost_price", results[0])
        self.assertEqual(results[0]["name"], "Napoleon")

    def test_register_login_and_place_order(self):
        register_res = self.client_api.post(
            "/api/v1/public/auth/register/",
            {
                "phone": "+996555111222",
                "password": "secretpass",
                "name": "Aziz",
                "last_name": "Test",
            },
            format="json",
        )
        self.assertEqual(register_res.status_code, 201, register_res.data)
        token = register_res.data["token"]

        # Дублирующая регистрация тем же номером запрещена
        dup_res = self.client_api.post(
            "/api/v1/public/auth/register/",
            {"phone": "+996555111222", "password": "another", "name": "X"},
            format="json",
        )
        self.assertEqual(dup_res.status_code, 400)

        login_res = self.client_api.post(
            "/api/v1/public/auth/login/",
            {"phone": "+996555111222", "password": "secretpass"},
            format="json",
        )
        self.assertEqual(login_res.status_code, 200)
        self.assertEqual(login_res.data["token"], token)

        wrong_login = self.client_api.post(
            "/api/v1/public/auth/login/",
            {"phone": "+996555111222", "password": "wrong"},
            format="json",
        )
        self.assertEqual(wrong_login.status_code, 400)

        auth_client = APIClient()
        auth_client.credentials(HTTP_AUTHORIZATION=f"Token {token}")

        me_res = auth_client.get("/api/v1/public/auth/me/")
        self.assertEqual(me_res.status_code, 200)
        self.assertEqual(me_res.data["phone"], "+996555111222")

        patch_res = auth_client.patch(
            "/api/v1/public/auth/me/", {"name": "Aziz updated"}, format="json"
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.data["name"], "Aziz updated")

        order_res = auth_client.post(
            "/api/v1/public/orders/",
            {
                "organization": self.org.id,
                "order_date": str(date.today() + timedelta(days=1)),
                "items": [{"product": self.product.id, "count": 2}],
            },
            format="json",
        )
        self.assertEqual(order_res.status_code, 201, order_res.data)
        self.assertEqual(Decimal(order_res.data["total_prise"]), Decimal("300.00"))

        # Заказ виден в истории, с деталями организации и позиций
        history_res = auth_client.get("/api/v1/public/orders/")
        self.assertEqual(history_res.status_code, 200)
        results = (
            history_res.data["results"]
            if isinstance(history_res.data, dict)
            else history_res.data
        )
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["organization"]["name"], "Test bakery")

        # Анонимный доступ к заказам запрещён
        anon_res = self.client_api.get("/api/v1/public/orders/")
        self.assertEqual(anon_res.status_code, 401)

    def test_order_over_daily_limit_is_rejected(self):
        self.product.daily_order_limit = 1
        self.product.save(update_fields=["daily_order_limit"])

        register_res = self.client_api.post(
            "/api/v1/public/auth/register/",
            {"phone": "+996555333444", "password": "secretpass", "name": "Over"},
            format="json",
        )
        auth_client = APIClient()
        auth_client.credentials(
            HTTP_AUTHORIZATION=f"Token {register_res.data['token']}"
        )

        res = auth_client.post(
            "/api/v1/public/orders/",
            {
                "organization": self.org.id,
                "order_date": str(date.today() + timedelta(days=1)),
                "items": [{"product": self.product.id, "count": 5}],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("limit_exceeded", res.data)
