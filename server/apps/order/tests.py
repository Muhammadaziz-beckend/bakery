from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase

from apps.client.models import Client
from apps.organization.models import Organization
from apps.production.models import ProductProduction, ProductProductionSoldItem
from apps.warehouse.models.product import Category, Product
from core.constants import DONE, PENDING, RETURNED

from .models import Order, OrderItem


class ProductionBatchAllocationTests(TestCase):
    """Заказ, переходящий в DONE, должен списывать конкретные партии
    производства (FIFO по сроку годности) — иначе партия остаётся
    помеченной как "не продано" и в Производстве продолжает показывать
    "истекает срок", даже если товар уже реально продан клиенту."""

    @classmethod
    def setUpTestData(cls):
        cls.org = Organization.objects.create(name="Test bakery", address="—")
        cls.client_obj = Client.objects.create(
            organization=cls.org, name="Client", tel="+996555000000"
        )
        cls.category = Category.objects.create(organization=cls.org, name="Cakes")
        cls.product = Product.objects.create(
            organization=cls.org,
            category=cls.category,
            name="Napoleon",
            price=Decimal("100"),
            cost_price=Decimal("50"),
            count_in_warehouse=Decimal("0"),
        )

    def _make_batch(self, count, days_left):
        return ProductProduction.objects.create(
            product=self.product,
            count=Decimal(count),
            best_before_date=date.today() + timedelta(days=days_left),
        )

    def _make_order(self, count):
        order = Order.objects.create(
            organization=self.org, client=self.client_obj, status=PENDING
        )
        item = OrderItem.objects.create(order=order, product=self.product, count=count)
        return order, item

    def test_done_order_marks_earliest_batch_sold(self):
        early = self._make_batch(2, 1)
        late = self._make_batch(2, 5)
        self.product.count_in_warehouse = Decimal("4")
        self.product.save(update_fields=["count_in_warehouse"])

        order, item = self._make_order(2)
        order.status = DONE
        order.save()

        early.refresh_from_db()
        late.refresh_from_db()
        self.assertTrue(early.is_sold)
        self.assertFalse(late.is_sold)
        self.assertEqual(
            ProductProductionSoldItem.objects.filter(production=early).count(), 1
        )
        self.assertEqual(
            ProductProductionSoldItem.objects.get(production=early).order_item_id,
            item.id,
        )

    def test_order_spans_multiple_batches(self):
        early = self._make_batch(1, 1)
        late = self._make_batch(3, 5)
        self.product.count_in_warehouse = Decimal("4")
        self.product.save(update_fields=["count_in_warehouse"])

        order, item = self._make_order(2)
        order.status = DONE
        order.save()

        early.refresh_from_db()
        late.refresh_from_db()
        self.assertTrue(early.is_sold)
        self.assertFalse(late.is_sold)
        self.assertEqual(
            ProductProductionSoldItem.objects.get(production=late).count,
            Decimal("1"),
        )

    def test_returning_order_releases_batch(self):
        batch = self._make_batch(1, 1)
        self.product.count_in_warehouse = Decimal("1")
        self.product.save(update_fields=["count_in_warehouse"])

        order, item = self._make_order(1)
        order.status = DONE
        order.save()

        batch.refresh_from_db()
        self.assertTrue(batch.is_sold)

        order.status = RETURNED
        order.save()

        batch.refresh_from_db()
        self.assertFalse(batch.is_sold)
        self.assertFalse(
            ProductProductionSoldItem.objects.filter(production=batch).exists()
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.count_in_warehouse, Decimal("1"))

    def test_deleting_done_order_item_releases_batch(self):
        batch = self._make_batch(1, 1)
        self.product.count_in_warehouse = Decimal("1")
        self.product.save(update_fields=["count_in_warehouse"])

        order, item = self._make_order(1)
        order.status = DONE
        order.save()

        batch.refresh_from_db()
        self.assertTrue(batch.is_sold)

        order.delete()

        batch.refresh_from_db()
        self.assertFalse(batch.is_sold)
        self.assertFalse(
            ProductProductionSoldItem.objects.filter(production=batch).exists()
        )
