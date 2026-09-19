// Должно совпадать с core/constants.py на бэкенде.

export const ORDER_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in progress",
  DONE: "done",
  RETURNED: "returned",
};

export const ORDER_STATUS_LABELS = {
  [ORDER_STATUS.PENDING]: "В ожидании",
  [ORDER_STATUS.IN_PROGRESS]: "В процессе",
  [ORDER_STATUS.DONE]: "Готово",
  [ORDER_STATUS.RETURNED]: "Возврат",
};

// Порядок статусов для сводки/фильтра на странице заказов.
export const ORDER_STATUS_LIST = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.IN_PROGRESS,
  ORDER_STATUS.DONE,
  ORDER_STATUS.RETURNED,
];

// Следующий статус для кнопки быстрого действия на карточке заказа.
export const NEXT_ORDER_STATUS = {
  [ORDER_STATUS.PENDING]: ORDER_STATUS.IN_PROGRESS,
  [ORDER_STATUS.IN_PROGRESS]: ORDER_STATUS.DONE,
};

export const RECEIPT_METHOD = {
  SELF_PICKUP: "self-pickup",
  DELIVERY: "delivery",
};

export const RECEIPT_METHOD_LABELS = {
  [RECEIPT_METHOD.SELF_PICKUP]: "Самовывоз",
  [RECEIPT_METHOD.DELIVERY]: "Доставка",
};

export const PAYMENT_STATUS = {
  UNPAID: "unpaid",
  PAID: "paid",
};

export const PAYMENT_STATUS_LABELS = {
  [PAYMENT_STATUS.UNPAID]: "Не оплачено",
  [PAYMENT_STATUS.PAID]: "Оплачено",
};
