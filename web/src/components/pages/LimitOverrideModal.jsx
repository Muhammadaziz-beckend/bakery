import { useEffect, useState } from "react";
import Get from "../../utils/routes/get";
import Post from "../../utils/routes/post";
import Put from "../../utils/routes/put";
import Del from "../../utils/routes/del";
import { errorMessage, isApiError } from "../../utils/apiHelpers";
import "../../static/css/components/pages/limit_override_modal.css";

// Особые лимиты заказов на конкретную дату (напр. Новый год — 200 тортов
// вместо обычных 20) — переопределяют Product.daily_order_limit только на
// эту дату. Доступно только владельцу организации (см. IsOrganizationOwner
// на бэкенде), кнопка открытия скрыта для остальных на Order.jsx.
export function LimitOverrideModal({ open, token, onClose }) {
  const [products, setProducts] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [productId, setProductId] = useState("");
  const [date, setDate] = useState("");
  const [limit, setLimit] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = async () => {
    setLoading(true);
    setListError("");
    const [productRes, overrideRes] = await Promise.all([
      Get("product/?limit=100", token),
      Get("order-limit-override/?limit=100", token),
    ]);
    if (isApiError(productRes) || isApiError(overrideRes)) {
      setListError(
        errorMessage(
          isApiError(productRes) ? productRes : overrideRes,
          "Не удалось загрузить особые лимиты"
        )
      );
    } else {
      setProducts(
        Array.isArray(productRes.data) ? productRes.data : (productRes.data?.results ?? [])
      );
      setOverrides(
        Array.isArray(overrideRes.data)
          ? overrideRes.data
          : (overrideRes.data?.results ?? [])
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token]);

  if (!open) return null;

  const isValid = !!productId && !!date && Number(limit) >= 0 && limit !== "";
  const isEditing = editingId !== null;

  const resetForm = () => {
    setEditingId(null);
    setProductId("");
    setDate("");
    setLimit("");
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setProductId(String(item.product));
    setDate(item.date);
    setLimit(String(item.limit));
    setFormError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    setFormError(null);
    const payload = { product: Number(productId), date, limit: Number(limit) };
    const res = isEditing
      ? await Put(`order-limit-override/${editingId}/`, payload, token)
      : await Post("order-limit-override/", payload, token);
    setSubmitting(false);

    if (isApiError(res)) {
      setFormError(res);
      return;
    }

    resetForm();
    await load();
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Убрать особый лимит «${item.product_name}» на ${item.date}?`)) return;
    const res = await Del(`order-limit-override/${item.id}/`, token);
    if (isApiError(res)) {
      alert(errorMessage(res, "Не удалось удалить особый лимит"));
      return;
    }
    if (editingId === item.id) resetForm();
    await load();
  };

  return (
    <div className="limit_override_overlay" onClick={onClose}>
      <div className="limit_override_modal" onClick={(event) => event.stopPropagation()}>
        <div className="limit_override_header">
          <div>
            <h3>Особые лимиты на дату</h3>
            <p className="limit_override_subtitle">
              Переопределяют обычный дневной лимит товара на конкретную дату —
              напр. Новый год: 200 вместо обычных 20.
            </p>
          </div>
          <button
            type="button"
            className="limit_override_close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {listError && <div className="form_error_banner">{listError}</div>}

        <form className="limit_override_form" onSubmit={handleSubmit}>
          <div className="select_wrapper">
            <select
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              disabled={loading || isEditing}
            >
              <option value="">— товар —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="select_arrow">⌄</span>
          </div>

          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={isEditing}
          />

          <input
            type="number"
            min="0"
            step="1"
            placeholder="Лимит"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          />

          <button type="submit" className="limit_override_add_btn" disabled={!isValid || submitting}>
            {submitting ? "…" : isEditing ? "Сохранить" : "Добавить"}
          </button>

          {isEditing && (
            <button
              type="button"
              className="limit_override_cancel_btn"
              onClick={resetForm}
              disabled={submitting}
            >
              Отмена
            </button>
          )}
        </form>

        {formError && (
          <div className="form_error_banner">
            {errorMessage(formError, "Не удалось сохранить особый лимит")}
          </div>
        )}

        {loading ? (
          <div className="limit_override_loading">Загрузка…</div>
        ) : overrides.length === 0 ? (
          <div className="limit_override_loading">Особых лимитов пока нет</div>
        ) : (
          <table className="limit_override_table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Дата</th>
                <th>Лимит</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => (
                <tr key={o.id} className={editingId === o.id ? "editing" : ""}>
                  <td>{o.product_name}</td>
                  <td>{new Date(o.date).toLocaleDateString("ru-RU")}</td>
                  <td>{o.limit === 0 ? "без лимита" : o.limit}</td>
                  <td className="limit_override_row_actions">
                    <button
                      type="button"
                      className="limit_override_edit_btn"
                      onClick={() => handleEdit(o)}
                      aria-label="Изменить"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="limit_override_delete_btn"
                      onClick={() => handleDelete(o)}
                      aria-label="Удалить"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
