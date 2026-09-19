import { useEffect, useState } from "react";
import { getOrders } from "../api/storefront";
import { errorMessage, formatMoney, isApiError } from "../utils/apiHelpers";
import Config from "../utils/data.jsx";

const STATUS_LABELS = {
  pending: "в ожидании",
  "in progress": "в процессе",
  done: "готово",
  returned: "возврат",
};

const STATUS_BADGE = {
  pending: "badge--warning",
  "in progress": "badge--warning",
  done: "badge--ok",
  returned: "badge--muted",
};

const PAYMENT_LABELS = {
  unpaid: "не оплачено",
  paid: "оплачено",
};

const RECEIPT_LABELS = {
  "self-pickup": "самовывоз",
  delivery: "доставка",
};

export function Orders() {
  const { token } = Config();
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await getOrders(token, { page: 1 });
      if (cancelled) return;
      if (isApiError(res)) {
        setError(errorMessage(res, "Не удалось загрузить заказы."));
        setOrders([]);
        setHasMore(false);
      } else {
        setOrders(res.data?.results ?? res.data ?? []);
        setHasMore(Boolean(res.data?.next));
        setPage(1);
        setError("");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleLoadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    const res = await getOrders(token, { page: nextPage });
    if (!isApiError(res)) {
      setOrders((prev) => [...prev, ...(res.data?.results ?? [])]);
      setHasMore(Boolean(res.data?.next));
      setPage(nextPage);
    }
    setLoadingMore(false);
  };

  return (
    <div className="page-wrap">
      <div className="page-header">
        <h1>Мои заказы</h1>
      </div>

      {loading && <p className="table__hint">Загрузка…</p>}
      {!loading && error && <div className="alert alert-error">{error}</div>}
      {!loading && !error && orders.length === 0 && (
        <p className="table__empty">Заказов пока нет.</p>
      )}

      <div className="order-list">
        {orders.map((order) => (
          <div key={order.id} className="card order-card">
            <div className="order-card__header">
              <div>
                <strong>{order.organization?.name}</strong>
                <p className="page-hint">Заказ #{order.id} на {order.order_date}</p>
              </div>
              <div className="order-card__badges">
                <span className={`badge ${STATUS_BADGE[order.status] ?? "badge--muted"}`}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
                <span className={`badge ${order.payment_status === "paid" ? "badge--ok" : "badge--warning"}`}>
                  {PAYMENT_LABELS[order.payment_status] ?? order.payment_status}
                </span>
              </div>
            </div>

            <ul className="order-card__items">
              {order.items?.map((item) => (
                <li key={item.id}>
                  {item.product_name}
                  {item.variant_name ? ` (${item.variant_name})` : ""} × {item.count}
                </li>
              ))}
            </ul>

            <div className="order-card__footer">
              <span>{RECEIPT_LABELS[order.receipt_method] ?? order.receipt_method}</span>
              <strong>{formatMoney(order.total_prise)} с</strong>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="load-more">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Загрузка…" : "Показать ещё"}
          </button>
        </div>
      )}
    </div>
  );
}
