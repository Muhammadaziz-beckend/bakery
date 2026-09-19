PENDING = "pending"
IN_PROGRESS = "in progress"
DONE = "done"
RETURNED = "returned"

CHOICES_STATUS_ORDER = (
    (PENDING, "в ожидании"),
    (IN_PROGRESS, "в процессе"),
    (DONE, "готово"),
    (RETURNED, "возврат"),
)

SELF_PICKUP = "self-pickup"
DELIVERY = "delivery"

CHOICES_RECEIPT_METHOD = (
    (SELF_PICKUP, "самовывоз"),
    (DELIVERY, "доставка"),
)

UNPAID = "unpaid"
PAID = "paid"

CHOICES_PAYMENT_STATUS = (
    (UNPAID, "не оплачено"),
    (PAID, "оплачено"),
)
