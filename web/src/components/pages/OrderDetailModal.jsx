import { formatMoney } from "../../utils/apiHelpers";
import {
  ORDER_STATUS_LABELS,
  RECEIPT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "../../utils/orderConstants";
import "../../static/css/components/pages/order_detail_modal.css";

// Детальный просмотр заказа — что именно было заказано (открывается кликом
// по карточке заказа на странице Order.jsx). Данные уже есть в списке
// заказов (ListOrderSerializer отдаёт items вместе с заказом), поэтому
// отдельный запрос не нужен.
export function OrderDetailModal({ open, order, onClose, onEdit }) {
  if (!open || !order) return null;

  return (
    <div className="order_detail_overlay" onClick={onClose}>
      <div className="order_detail" onClick={(event) => event.stopPropagation()}>
        <div className="order_detail_header">
          <div>
            <h3>Заказ №{order.id}</h3>
            <span className={`order_status_badge status_${order.status.replace(" ", "_")}`}>
              {ORDER_STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>
          <button
            type="button"
            className="order_detail_close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="order_detail_client">
          <span className="order_detail_client_name">
            {order.client_detail?.name} {order.client_detail?.last_name || ""}
          </span>
          <span className="order_detail_client_tel">{order.client_detail?.tel}</span>
        </div>

        <div className="order_detail_meta">
          <span>{PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status}</span>
          <span>·</span>
          <span>{RECEIPT_METHOD_LABELS[order.receipt_method] ?? order.receipt_method}</span>
          {order.order_date && (
            <>
              <span>·</span>
              <span>на {new Date(order.order_date).toLocaleDateString("ru-RU")}</span>
            </>
          )}
          <span>·</span>
          <span>оформлен {new Date(order.create_dt).toLocaleString("ru-RU")}</span>
        </div>

        <div className="order_detail_items">
          <table>
            <thead>
              <tr>
                <th>Товар</th>
                <th>Кол-во</th>
                <th>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {(order.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.product_name ?? item.product_detail?.name}
                    {item.variant_name ? ` (${item.variant_name})` : ""}
                  </td>
                  <td>×{item.count}</td>
                  <td>{formatMoney(item.total_prise)} сом</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="order_detail_total">
          <span>Итого</span>
          <span>{formatMoney(order.total_prise)} сом</span>
        </div>

        {onEdit && (
          <button type="button" className="order_detail_edit_btn" onClick={() => onEdit(order)}>
            Изменить заказ
          </button>
        )}
      </div>
    </div>
  );
}
