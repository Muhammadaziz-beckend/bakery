import "../../static/css/components/pages/production_journal.css";

function formatDate(iso) {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function daysLeft(iso) {
  if (!iso) return null;
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// items приходят уже смэппенные с backend (см. Production.jsx): id, name,
// count, bestBeforeDate, soldCount, costPrice, createDt.
// onEdit/onDelete получают весь item целиком — по нему строятся
// PATCH /production/:id и DELETE /production/:id.
// showExpiry=false — партия уже продана (или сейчас показан список "Проданные" в
// Production.jsx): срок годности проданной партии не имеет смысла показывать —
// вместо даты/дней просто помечаем «Продано».
export function ProductionJournal({
  title = "Журнал производства",
  items = [],
  showExpiry = true,
  onEdit,
  onDelete,
}) {
  return (
    <div className="production_journal">
      <h3>{title}</h3>

      <table>
        <thead>
          <tr>
            <th>Товар</th>
            <th>Кол-во</th>
            <th>Продано</th>
            <th>Себест.</th>
            <th>Срок годности</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td className="empty" colSpan={6}>
                Нет данных
              </td>
            </tr>
          ) : (
            items.map((item) => {
              const left = daysLeft(item.bestBeforeDate);
              const locked = item.soldCount > 0;
              const sold = item.isSold;

              return (
                <tr key={item.id}>
                  <td>
                    <span className="product_name">
                      {item.name}
                      {item.variantName ? ` — ${item.variantName}` : ""}
                    </span>
                    <span className="product_date">{formatDate(item.createDt)}</span>
                  </td>
                  <td>{item.count} шт.</td>
                  <td>{item.soldCount > 0 ? `${item.soldCount} из ${item.count}` : "—"}</td>
                  <td>{item.costPrice != null ? `${item.costPrice.toFixed(2)} сом` : "—"}</td>
                  <td>
                    {showExpiry && !sold ? (
                      <span
                        className={`expiry ${left != null && left <= 2 ? "warning" : "good"}`}
                      >
                        {formatDate(item.bestBeforeDate)}
                        {left != null ? ` (${left}д.)` : ""}
                      </span>
                    ) : (
                      <span className="expiry sold">Продано</span>
                    )}
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        className="action_btn edit"
                        onClick={() => onEdit?.(item)}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="action_btn delete"
                        disabled={locked}
                        title={
                          locked
                            ? "По партии уже есть проданные позиции — удаление недоступно"
                            : undefined
                        }
                        onClick={() => onDelete?.(item)}
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
