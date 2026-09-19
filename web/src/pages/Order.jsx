import { useCallback, useEffect, useState } from "react";
import { Navigation } from "../components/main/Navigation";
import { Pagination } from "../components/pages/Pagination";
import { OrderFormModal } from "../components/pages/OrderFormModal";
import { OrderDetailModal } from "../components/pages/OrderDetailModal";
import { LimitOverrideModal } from "../components/pages/LimitOverrideModal";
import Get from "../utils/routes/get";
import Post from "../utils/routes/post";
import Put from "../utils/routes/put";
import Del from "../utils/routes/del";
import Config from "../utils/data.jsx";
import { errorMessage, isApiError, formatMoney } from "../utils/apiHelpers";
import {
  ORDER_STATUS,
  ORDER_STATUS_LIST,
  ORDER_STATUS_LABELS,
  NEXT_ORDER_STATUS,
} from "../utils/orderConstants";
import "../static/css/pages/order.css";

// должно совпадать с pagination_dynamic(12) в OrderModelViewSet
const ORDER_PAGE_SIZE = 12;

export function Order() {
  const { token, isOwner } = Config();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalCount / ORDER_PAGE_SIZE));

  const [statusFilter, setStatusFilter] = useState(null);
  const [statusCounts, setStatusCounts] = useState({});

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingItem, setEditingItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const [detailOrder, setDetailOrder] = useState(null);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);

  const loadOrders = useCallback(
    async (targetPage, status) => {
      const params = new URLSearchParams({ page: targetPage });
      if (status) params.set("status", status);
      const res = await Get(`order/?${params.toString()}`, token);
      if (isApiError(res)) {
        setListError(errorMessage(res, "Не удалось загрузить заказы"));
        return;
      }
      const data = res.data;
      const list = Array.isArray(data) ? data : (data?.results ?? []);
      setItems(list);
      setTotalCount(Array.isArray(data) ? list.length : (data?.count ?? list.length));
      setPage(targetPage);
    },
    [token]
  );

  const loadStatusCounts = useCallback(async () => {
    const results = await Promise.all(
      ORDER_STATUS_LIST.map((status) =>
        Get(`order/?status=${encodeURIComponent(status)}&page=1`, token)
      )
    );
    const counts = {};
    ORDER_STATUS_LIST.forEach((status, index) => {
      const res = results[index];
      if (!isApiError(res)) {
        const data = res.data;
        counts[status] = Array.isArray(data) ? data.length : (data?.count ?? 0);
      }
    });
    setStatusCounts(counts);
  }, [token]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setListError("");
      await Promise.all([loadOrders(1, statusFilter), loadStatusCounts()]);
      setLoading(false);
    })();
  }, [loadOrders, loadStatusCounts, statusFilter]);

  const handlePageChange = async (targetPage) => {
    setLoading(true);
    await loadOrders(targetPage, statusFilter);
    setLoading(false);
  };

  const handleToggleStatusFilter = (status) => {
    setStatusFilter((prev) => (prev === status ? null : status));
  };

  const handleCreate = () => {
    setFormMode("create");
    setEditingItem(null);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleEdit = (item) => {
    setFormMode("edit");
    setEditingItem(item);
    setFormError(null);
    setDetailOrder(null);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    if (submitting) return;
    setIsFormOpen(false);
  };

  const refreshAfterChange = async () => {
    await Promise.all([loadOrders(page, statusFilter), loadStatusCounts()]);
  };

  const handleSubmitForm = async ({ clientId, newClient, items: orderItems, ...rest }) => {
    setSubmitting(true);
    setFormError(null);

    let finalClientId = clientId;
    if (newClient) {
      const clientRes = await Post("client/", newClient, token);
      if (isApiError(clientRes)) {
        setSubmitting(false);
        setFormError(clientRes);
        return;
      }
      finalClientId = clientRes.data.id;
    }

    const payload = { ...rest, client: finalClientId, items: orderItems };

    const res =
      formMode === "edit" && editingItem
        ? await Put(`order/${editingItem.id}/`, payload, token)
        : await Post("order/", payload, token);

    setSubmitting(false);

    if (isApiError(res)) {
      setFormError(res);
      return;
    }

    setIsFormOpen(false);
    await Promise.all([loadOrders(formMode === "edit" ? page : 1, statusFilter), loadStatusCounts()]);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Удалить заказ №${item.id}?`)) return;

    const res = await Del(`order/${item.id}/`, token);
    if (isApiError(res)) {
      alert(errorMessage(res, "Не удалось удалить заказ"));
      return;
    }

    setDetailOrder(null);
    const targetPage = items.length === 1 && page > 1 ? page - 1 : page;
    await Promise.all([loadOrders(targetPage, statusFilter), loadStatusCounts()]);
  };

  const handleQuickStatus = async (item, newStatus) => {
    const res = await Put(
      `order/${item.id}/`,
      {
        client: item.client,
        status: newStatus,
        receipt_method: item.receipt_method,
        payment_status: item.payment_status,
      },
      token
    );
    if (isApiError(res)) {
      alert(errorMessage(res, "Не удалось изменить статус заказа"));
      return;
    }
    await refreshAfterChange();
  };

  return (
    <>
      <Navigation />

      <div className="main">
        <div className="container">
          <div className="main_items">
            <div className="header header_with_action">
              <h2>Заказы клиентов</h2>

              <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />

              <div className="header_actions">
                {isOwner && (
                  <button
                    type="button"
                    className="btn_secondary_action"
                    onClick={() => setIsLimitModalOpen(true)}
                  >
                    Особые лимиты
                  </button>
                )}

                <button type="button" className="btn_create_batch" onClick={handleCreate}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="20px"
                    viewBox="0 -960 960 960"
                    width="20px"
                  >
                    <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z" />
                  </svg>
                  Новый заказ
                </button>
              </div>
            </div>

            <div className="order_status_summary">
              {ORDER_STATUS_LIST.map((status) => (
                <button
                  type="button"
                  key={status}
                  className={`order_status_card status_${status.replace(" ", "_")}${
                    statusFilter === status ? " active" : ""
                  }`}
                  onClick={() => handleToggleStatusFilter(status)}
                >
                  <span className="order_status_card_label">
                    {ORDER_STATUS_LABELS[status]}
                  </span>
                  <span className="order_status_card_value">{statusCounts[status] ?? 0}</span>
                </button>
              ))}
            </div>

            {listError && <div className="form_error_banner">{listError}</div>}

            {loading ? (
              <div className="production_journal_loading">Загрузка…</div>
            ) : items.length === 0 ? (
              <div className="production_journal_loading">Нет заказов</div>
            ) : (
              <div className="order_list">
                {items.map((item) => {
                  const nextStatus = NEXT_ORDER_STATUS[item.status];
                  const itemsSummary = (item.items ?? [])
                    .map(
                      (i) =>
                        `${i.product_name}${i.variant_name ? ` (${i.variant_name})` : ""} ×${i.count}`
                    )
                    .join(", ");

                  return (
                    <div
                      className="order_card"
                      key={item.id}
                      onClick={() => setDetailOrder(item)}
                    >
                      <div className="order_card_top">
                        <div className="order_card_client">
                          <span className="order_card_name">
                            {item.client_detail?.name} {item.client_detail?.last_name || ""}
                          </span>
                          <span
                            className={`order_status_badge status_${item.status.replace(" ", "_")}`}
                          >
                            {ORDER_STATUS_LABELS[item.status] ?? item.status}
                          </span>
                        </div>
                        <div className="order_card_meta">
                          <span className="order_card_date">
                            {item.order_date
                              ? new Date(item.order_date).toLocaleDateString("ru-RU")
                              : new Date(item.create_dt).toLocaleDateString("ru-RU")}
                          </span>
                          <span className="order_card_total">
                            {formatMoney(item.total_prise)} сом
                          </span>
                        </div>
                      </div>

                      <div className="order_card_tel">{item.client_detail?.tel}</div>

                      {itemsSummary && (
                        <div className="order_card_items">{itemsSummary}</div>
                      )}

                      <div className="order_card_actions" onClick={(e) => e.stopPropagation()}>
                        {nextStatus && (
                          <button
                            type="button"
                            className="action_btn advance"
                            onClick={() => handleQuickStatus(item, nextStatus)}
                          >
                            → {ORDER_STATUS_LABELS[nextStatus]}
                          </button>
                        )}
                        {item.status === ORDER_STATUS.DONE && (
                          <button
                            type="button"
                            className="action_btn return"
                            onClick={() => {
                              if (window.confirm("Оформить возврат заказа? Товар вернётся на склад."))
                                handleQuickStatus(item, ORDER_STATUS.RETURNED);
                            }}
                          >
                            Возврат
                          </button>
                        )}
                        <button
                          type="button"
                          className="action_btn edit"
                          onClick={() => handleEdit(item)}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="action_btn delete"
                          onClick={() => handleDelete(item)}
                          aria-label="Удалить"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {isFormOpen && (
        <OrderFormModal
          key={editingItem?.id ?? "create"}
          open={isFormOpen}
          mode={formMode}
          token={token}
          initialValues={editingItem}
          submitting={submitting}
          serverError={formError}
          isOwner={isOwner}
          onSubmit={handleSubmitForm}
          onClose={handleCloseForm}
        />
      )}

      <OrderDetailModal
        open={!!detailOrder}
        order={detailOrder}
        onClose={() => setDetailOrder(null)}
        onEdit={handleEdit}
      />

      {isOwner && (
        <LimitOverrideModal
          open={isLimitModalOpen}
          token={token}
          onClose={() => setIsLimitModalOpen(false)}
        />
      )}
    </>
  );
}
