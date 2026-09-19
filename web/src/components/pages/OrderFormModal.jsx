import { useEffect, useState } from "react";
import Get from "../../utils/routes/get";
import { errorMessage, isApiError, formatMoney } from "../../utils/apiHelpers";
import {
  ORDER_STATUS,
  ORDER_STATUS_LIST,
  ORDER_STATUS_LABELS,
  RECEIPT_METHOD,
  RECEIPT_METHOD_LABELS,
  PAYMENT_STATUS,
  PAYMENT_STATUS_LABELS,
} from "../../utils/orderConstants";
import "../../static/css/components/pages/order_form_modal.css";

const emptyRow = () => ({ key: crypto.randomUUID(), product: "", variant: "", count: "" });

// сегодняшняя дата в формате YYYY-MM-DD (для <input type="date">), в
// локальном часовом поясе — не toISOString(), тот бы уехал на UTC
const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Заказ вместе с позициями — та же идея, что у RestockModal (приход сырья):
// клиента можно выбрать из списка или сразу завести нового, товары — строками
// как рецептура в ProductFormModal. Плюс дата заказа — по ней считается
// дневной лимит товара (см. availability ниже и apps/order/services.py).
export function OrderFormModal({
  open,
  mode = "create",
  token,
  initialValues,
  submitting = false,
  serverError = null,
  isOwner = false,
  onSubmit,
  onClose,
}) {
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [refsError, setRefsError] = useState("");

  const [orderDate, setOrderDate] = useState(initialValues?.order_date ?? todayISO());
  // product id -> { limit, used, remaining, is_full } на выбранную дату
  const [availability, setAvailability] = useState({});
  const [forceOverLimit, setForceOverLimit] = useState(false);

  const [clientId, setClientId] = useState(
    initialValues?.client ? String(initialValues.client) : ""
  );
  const [isNewClient, setIsNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientLastName, setNewClientLastName] = useState("");
  const [newClientTel, setNewClientTel] = useState("");

  const [status, setStatus] = useState(initialValues?.status ?? ORDER_STATUS.PENDING);
  const [receiptMethod, setReceiptMethod] = useState(
    initialValues?.receipt_method ?? RECEIPT_METHOD.SELF_PICKUP
  );
  const [paymentStatus, setPaymentStatus] = useState(
    initialValues?.payment_status ?? PAYMENT_STATUS.UNPAID
  );

  const [rows, setRows] = useState(
    initialValues?.items?.length
      ? initialValues.items.map((i) => ({
          key: crypto.randomUUID(),
          product: String(i.product),
          variant: i.variant ? String(i.variant) : "",
          count: String(i.count),
        }))
      : [emptyRow()]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingRefs(true);
      // limit=100 — у product/ пагинация по 12, а тут нужен весь каталог для выбора
      const [clientRes, productRes] = await Promise.all([
        Get("client/", token),
        Get("product/?limit=100", token),
      ]);
      if (cancelled) return;

      if (isApiError(clientRes) || isApiError(productRes)) {
        setRefsError(
          errorMessage(
            isApiError(clientRes) ? clientRes : productRes,
            "Не удалось загрузить клиентов и товары"
          )
        );
      } else {
        const clientList = Array.isArray(clientRes.data)
          ? clientRes.data
          : (clientRes.data?.results ?? []);
        setClients(clientList);
        if (clientList.length === 0) setIsNewClient(true);

        const productList = Array.isArray(productRes.data)
          ? productRes.data
          : (productRes.data?.results ?? []);
        setProducts(productList);
      }
      setLoadingRefs(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Доступность товаров на выбранную дату — сколько уже заказано и сколько
  // ещё можно, чтобы показать это до попытки сохранить заказ (см.
  // OrderModelViewSet.availability на бэкенде).
  useEffect(() => {
    if (!orderDate) {
      setAvailability({});
      return;
    }
    let cancelled = false;

    (async () => {
      const res = await Get(`order/availability/?date=${orderDate}`, token);
      if (cancelled) return;
      if (!isApiError(res)) {
        const byProduct = Object.fromEntries(
          (res.data?.results ?? []).map((r) => [String(r.product), r])
        );
        setAvailability(byProduct);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderDate, token]);

  // смена даты или состава заказа обесценивает предыдущее "подтверждаю
  // превышение" — чтобы принудительное оформление не проехало молча на
  // изменившийся заказ
  useEffect(() => {
    setForceOverLimit(false);
  }, [orderDate]);

  if (!open) return null;

  const productById = Object.fromEntries(products.map((p) => [String(p.id), p]));

  // при правке заказа availability уже включает его собственные позиции —
  // прибавляем их обратно к remaining, иначе подсказка занижает остаток на
  // количество, которое сам этот заказ и занимает (см. exclude_order_id на
  // бэкенде — там лимит считается верно, здесь поправка только для подсказки)
  const ownCountByProduct =
    mode === "edit"
      ? (initialValues?.items ?? []).reduce((acc, i) => {
          acc[String(i.product)] = (acc[String(i.product)] ?? 0) + Number(i.count);
          return acc;
        }, {})
      : {};

  const remainingFor = (productId) => {
    const avail = availability[productId];
    if (!avail || avail.remaining === null) return null;
    const own = ownCountByProduct[productId] ?? 0;
    return Math.min(avail.limit, avail.remaining + own);
  };

  // товар с вариантами (размерами) продаётся только по варианту — у него
  // своя цена и свой остаток на складе, у самого product цена — заглушка
  // (см. ProductFormModal/backend OrderItemInlineSerializer.validate)
  const rowNeedsVariant = (row) => (productById[row.product]?.variants?.length ?? 0) > 0;

  const unitPrice = (row) => {
    const product = productById[row.product];
    if (!product) return null;
    if (rowNeedsVariant(row)) {
      const variant = product.variants.find((v) => String(v.id) === row.variant);
      return variant ? Number(variant.price) : null;
    }
    return Number(product.price);
  };

  // строка "начата" (товар выбран), но не готова к отправке — выбор варианта
  // ещё не сделан или не указано количество; такие строки не должны молча
  // выпадать из заказа при отправке формы
  const incompleteRow = rows.some((r) => {
    if (!r.product) return false;
    if (rowNeedsVariant(r) && !r.variant) return true;
    return !(Number(r.count) > 0);
  });

  const filledRows = rows.filter(
    (r) => r.product && Number(r.count) > 0 && (!rowNeedsVariant(r) || r.variant)
  );

  const duplicateProduct = (() => {
    const keys = filledRows.map((r) => `${r.product}:${r.variant || ""}`);
    return keys.length !== new Set(keys).size;
  })();

  const estimatedTotal = filledRows.reduce((sum, r) => {
    const price = unitPrice(r);
    return sum + (price != null ? price * Number(r.count) : 0);
  }, 0);

  const clientValid = isNewClient
    ? newClientName.trim().length > 0 && newClientTel.trim().length > 0
    : !!clientId;

  const isValid =
    clientValid &&
    !!orderDate &&
    filledRows.length > 0 &&
    !duplicateProduct &&
    !incompleteRow &&
    !loadingRefs;

  // превышает ли выбранное количество в строке остаток лимита на дату —
  // только подсказка, окончательно лимит считает бэкенд при сохранении
  const rowOverLimit = (row) => {
    const remaining = remainingFor(row.product);
    if (remaining === null) return false;
    return Number(row.count) > remaining;
  };

  const limitExceeded = serverError?.response?.data?.limit_exceeded;

  const updateRow = (key, patch) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isValid || submitting) return;

    onSubmit({
      order_date: orderDate,
      force_over_limit: forceOverLimit,
      clientId: isNewClient ? null : Number(clientId),
      newClient: isNewClient
        ? {
            name: newClientName.trim(),
            last_name: newClientLastName.trim() === "" ? null : newClientLastName.trim(),
            tel: newClientTel.trim(),
          }
        : null,
      status,
      receipt_method: receiptMethod,
      payment_status: paymentStatus,
      items: filledRows.map((r) => ({
        product: Number(r.product),
        variant: r.variant ? Number(r.variant) : null,
        count: Number(r.count),
      })),
    });
  };

  return (
    <div className="order_form_overlay" onClick={onClose}>
      <form
        className="order_form"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="order_form_header">
          <h3>{mode === "edit" ? "Изменить заказ" : "Новый заказ"}</h3>
          <button
            type="button"
            className="order_form_close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {refsError && <div className="form_error_banner">{refsError}</div>}

        <label className="field">
          <span className="field_label">Дата заказа</span>
          <input
            type="date"
            value={orderDate}
            onChange={(event) => setOrderDate(event.target.value)}
          />
          <span className="field_hint">
            Дата, на которую готовится заказ — по ней считается дневной лимит
            товара.
          </span>
        </label>

        <label className="field">
          <span className="field_label">Клиент</span>

          {!isNewClient ? (
            <div className="select_wrapper">
              <select
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                disabled={loadingRefs}
              >
                <option value="">— выберите клиента —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.last_name ?? ""} · {c.tel}
                  </option>
                ))}
              </select>
              <span className="select_arrow">⌄</span>
            </div>
          ) : (
            <div className="new_client_fields">
              <input
                type="text"
                placeholder="Имя"
                value={newClientName}
                onChange={(event) => setNewClientName(event.target.value)}
              />
              <input
                type="text"
                placeholder="Фамилия (необязательно)"
                value={newClientLastName}
                onChange={(event) => setNewClientLastName(event.target.value)}
              />
              <input
                type="tel"
                placeholder="+996 XXX XXX XXX"
                value={newClientTel}
                onChange={(event) => setNewClientTel(event.target.value)}
              />
            </div>
          )}

          {clients.length > 0 && (
            <button
              type="button"
              className="client_toggle"
              onClick={() => setIsNewClient((v) => !v)}
            >
              {isNewClient ? "← выбрать из списка" : "+ новый клиент"}
            </button>
          )}
        </label>

        <div className="field_row">
          <label className="field">
            <span className="field_label">Статус</span>
            <div className="select_wrapper">
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {ORDER_STATUS_LIST.map((s) => (
                  <option key={s} value={s}>
                    {ORDER_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <span className="select_arrow">⌄</span>
            </div>
          </label>

          <label className="field">
            <span className="field_label">Оплата</span>
            <div className="select_wrapper">
              <select
                value={paymentStatus}
                onChange={(event) => setPaymentStatus(event.target.value)}
              >
                {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="select_arrow">⌄</span>
            </div>
          </label>

          <label className="field">
            <span className="field_label">Получение</span>
            <div className="select_wrapper">
              <select
                value={receiptMethod}
                onChange={(event) => setReceiptMethod(event.target.value)}
              >
                {Object.entries(RECEIPT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="select_arrow">⌄</span>
            </div>
          </label>
        </div>

        <div className="items_block">
          <div className="items_head">
            <span className="field_label">Состав заказа</span>
            <button
              type="button"
              className="items_add"
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
              disabled={loadingRefs || products.length === 0}
            >
              + товар
            </button>
          </div>

          {products.length === 0 && !loadingRefs && (
            <p className="items_empty">Товаров пока нет — сначала добавьте их на складе.</p>
          )}

          {rows.map((row) => {
            const product = productById[row.product];
            const needsVariant = rowNeedsVariant(row);
            const price = unitPrice(row);
            return (
              <div className="item_row" key={row.key}>
                <div className="item_row_selects">
                  <div className="select_wrapper">
                    <select
                      value={row.product}
                      onChange={(event) =>
                        updateRow(row.key, { product: event.target.value, variant: "" })
                      }
                    >
                      <option value="">— товар —</option>
                      {products.map((p) => {
                        const hasVariants = p.variants?.length > 0;
                        const minPrice = hasVariants
                          ? Math.min(...p.variants.map((v) => Number(v.price)))
                          : null;
                        const avail = availability[String(p.id)];
                        const remaining = remainingFor(String(p.id));
                        const availabilityHint =
                          avail && remaining !== null
                            ? remaining > 0
                              ? ` (осталось ${remaining} из ${avail.limit} на эту дату)`
                              : " (лимит на эту дату исчерпан)"
                            : "";
                        return (
                          <option key={p.id} value={p.id}>
                            {p.name} ·{" "}
                            {hasVariants ? `от ${formatMoney(minPrice)} сом` : `${formatMoney(p.price)} сом`}
                            {availabilityHint}
                          </option>
                        );
                      })}
                    </select>
                    <span className="select_arrow">⌄</span>
                  </div>

                  {needsVariant && (
                    <div className="select_wrapper variant_select">
                      <select
                        value={row.variant}
                        onChange={(event) => updateRow(row.key, { variant: event.target.value })}
                      >
                        <option value="">— вариант —</option>
                        {product.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} · {formatMoney(v.price)} сом
                          </option>
                        ))}
                      </select>
                      <span className="select_arrow">⌄</span>
                    </div>
                  )}

                  {needsVariant && !row.variant && (
                    <span className="item_row_hint">У товара есть варианты — выберите размер.</span>
                  )}

                  {rowOverLimit(row) && (
                    <span className="item_row_hint item_row_hint_warning">
                      Превышает лимит товара на эту дату — сохранить сможет
                      только владелец, подтвердив превышение.
                    </span>
                  )}
                </div>

                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="1"
                  value={row.count}
                  onChange={(event) => updateRow(row.key, { count: event.target.value })}
                />

                <span className="item_line_total">
                  {price != null && Number(row.count) > 0
                    ? `${formatMoney(price * Number(row.count))} сом`
                    : ""}
                </span>

                <button
                  type="button"
                  className="item_remove"
                  onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  aria-label="Убрать товар"
                >
                  ×
                </button>
              </div>
            );
          })}

          {estimatedTotal > 0 && (
            <div className="items_total">
              <span>Итого</span>
              <span>{formatMoney(estimatedTotal)} сом</span>
            </div>
          )}
        </div>

        {duplicateProduct && (
          <div className="form_error_banner">
            Один и тот же товар (вариант) указан в заказе несколько раз.
          </div>
        )}

        {serverError && (
          <div className="form_error_banner">
            {errorMessage(serverError, "Не удалось сохранить заказ")}
          </div>
        )}

        {limitExceeded?.length > 0 && (
          <div className="limit_exceeded_panel">
            <ul>
              {limitExceeded.map((o) => (
                <li key={o.product}>
                  {o.product_name}: лимит {o.limit} на {o.date}, уже заказано{" "}
                  {o.already_ordered}, доступно ещё {o.available}, в заказе{" "}
                  {o.requested}.
                </li>
              ))}
            </ul>

            {isOwner ? (
              <label className="field_checkbox">
                <input
                  type="checkbox"
                  checked={forceOverLimit}
                  onChange={(event) => setForceOverLimit(event.target.checked)}
                />
                <span>
                  Подтверждаю превышение лимита — оформить заказ всё равно.
                </span>
              </label>
            ) : (
              <p className="limit_exceeded_hint">
                Оформить заказ сверх лимита может только владелец организации.
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          className="submit_btn"
          disabled={
            !isValid || submitting || (limitExceeded?.length > 0 && !forceOverLimit)
          }
        >
          {submitting
            ? "Сохранение…"
            : mode === "edit"
              ? "Сохранить изменения"
              : "Оформить заказ"}
        </button>
      </form>
    </div>
  );
}
