import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createOrder } from "../api/storefront";
import { errorMessage, formatMoney, isApiError } from "../utils/apiHelpers";
import { useCart } from "../context/CartContext.jsx";
import Config from "../utils/data.jsx";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function Cart() {
  const { orgId } = useParams();
  const { token } = Config();
  const { items, openOrg, orgId: activeOrgId, updateQty, removeItem, total, clear } = useCart();

  const [orderDate, setOrderDate] = useState(todayIso());
  const [receiptMethod, setReceiptMethod] = useState("self-pickup");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (String(activeOrgId) !== String(orgId)) openOrg(orgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting || items.length === 0) return;

    setSubmitting(true);
    setError("");

    const payload = {
      organization: Number(orgId),
      order_date: orderDate,
      receipt_method: receiptMethod,
      items: items.map((i) => ({
        product: i.productId,
        variant: i.variantId,
        count: i.qty,
      })),
    };

    const res = await createOrder(payload, token);
    if (isApiError(res)) {
      setError(errorMessage(res, "Не удалось оформить заказ."));
    } else {
      clear();
      setSuccess(true);
    }
    setSubmitting(false);
  };

  if (success) {
    return (
      <div className="page-wrap">
        <div className="alert alert-success">Заказ оформлен! Спасибо за покупку.</div>
        <div className="cart-empty-actions">
          <Link to="/orders" className="btn btn-primary">
            Мои заказы
          </Link>
          <Link to={`/store/${orgId}`} className="btn btn-ghost">
            Продолжить покупки
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="page-header">
        <h1>Корзина</h1>
      </div>

      {items.length === 0 ? (
        <div>
          <p className="table__empty">Корзина пуста.</p>
          <Link to={`/store/${orgId}`} className="btn btn-primary">
            К товарам
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-items">
            {items.map((item) => (
              <div key={`${item.productId}:${item.variantId ?? ""}`} className="cart-item">
                <div className="cart-item__img">
                  {item.img ? <img src={item.img} alt={item.name} /> : <span>🍞</span>}
                </div>
                <div className="cart-item__body">
                  <p className="cart-item__name">
                    {item.name}
                    {item.variantName && <span className="cart-item__variant"> — {item.variantName}</span>}
                  </p>
                  <p className="cart-item__price">{formatMoney(item.price)} с</p>
                </div>
                <div className="qty-stepper">
                  <button type="button" onClick={() => updateQty(item.productId, item.variantId, item.qty - 1)}>
                    −
                  </button>
                  <span>{item.qty}</span>
                  <button type="button" onClick={() => updateQty(item.productId, item.variantId, item.qty + 1)}>
                    +
                  </button>
                </div>
                <p className="cart-item__sum">{formatMoney(item.price * item.qty)} с</p>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => removeItem(item.productId, item.variantId)}
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>

          <form className="card cart-summary" onSubmit={handleSubmit}>
            <div className="kv-list__row kv-list__row--total">
              <dt>Итого</dt>
              <dd>{formatMoney(total)} с</dd>
            </div>

            <label className="field">
              <span>Дата заказа</span>
              <input
                type="date"
                min={todayIso()}
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                required
              />
            </label>

            <label className="field">
              <span>Способ получения</span>
              <select value={receiptMethod} onChange={(e) => setReceiptMethod(e.target.value)}>
                <option value="self-pickup">Самовывоз</option>
                <option value="delivery">Доставка</option>
              </select>
            </label>

            {error && <div className="alert alert-error">{error}</div>}

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? "Оформляем…" : "Оформить заказ"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
