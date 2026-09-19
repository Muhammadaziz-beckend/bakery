import { useCallback, useEffect, useState } from "react";
import { Navigation } from "../components/main/Navigation";
import { DateRangeModal } from "../components/pages/DateRangeModal";
import Get from "../utils/routes/get";
import Config from "../utils/data.jsx";
import { errorMessage, isApiError, formatMoney, buildQuery } from "../utils/apiHelpers";
import "../static/css/pages/report.css";

const PERIODS = [
  { value: "today", label: "Сегодня" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "all", label: "Всё время" },
];

function formatDate(iso) {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function formatShort(iso) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

// /report/ отдаёт уже готовую агрегацию — фронт только форматирует и
// раскладывает по вёрстке, без собственных вычислений. Важно: "произведено"
// (сколько испекли, из партий производства) и "продано"/выручка/прибыль
// (по фактическим заказам клиентов в статусе "готово") — две разные метрики,
// не путать: товар может быть испечён и ещё не продан к концу периода.
export function Report() {
  const { token } = Config();

  const [period, setPeriod] = useState("month");
  const [customRange, setCustomRange] = useState(null); // { from, to } | null
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [showAllExpiring, setShowAllExpiring] = useState(false);

  const loadReport = useCallback(async () => {
    const query = customRange
      ? buildQuery({ date_from: customRange.from, date_to: customRange.to })
      : buildQuery({ period });
    const res = await Get(`report/${query}`, token);
    if (isApiError(res)) {
      setListError(errorMessage(res, "Не удалось загрузить отчёт"));
      return;
    }
    setListError("");
    setData(res.data);
    setShowAllExpiring(false);
  }, [token, period, customRange]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadReport();
      setLoading(false);
    })();
  }, [loadReport]);

  const summary = data?.summary;
  const expiringSoon = data?.expiring_soon ?? [];
  const byProduct = data?.by_product ?? [];
  const ingredientConsumption = data?.ingredient_consumption ?? [];
  const costStructure = data?.cost_structure ?? [];

  return (
    <>
      <Navigation />

      <div className="main">
        <div className="container">
          <div className="main_items">
            <div className="header report_header">
              <h2>Отчёт</h2>

              <div className="period_toggle">
                {PERIODS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className={!customRange && p.value === period ? "active" : ""}
                    onClick={() => {
                      setCustomRange(null);
                      setPeriod(p.value);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`period_toggle_range ${customRange ? "active" : ""}`}
                  onClick={() => setShowRangePicker(true)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="16px"
                    viewBox="0 -960 960 960"
                    width="16px"
                  >
                    <path d="M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Z" />
                  </svg>
                  {customRange
                    ? `${formatShort(customRange.from)} – ${formatShort(customRange.to)}`
                    : "Период"}
                </button>
              </div>
            </div>

            <DateRangeModal
              open={showRangePicker}
              from={customRange?.from}
              to={customRange?.to}
              onApply={(from, to) => {
                setCustomRange({ from, to });
                setShowRangePicker(false);
              }}
              onClose={() => setShowRangePicker(false)}
            />

            {listError && <div className="form_error_banner">{listError}</div>}

            {loading || !summary ? (
              <div className="production_journal_loading">Загрузка…</div>
            ) : (
              <>
                <div className="report_summary_cards">
                  <div className="report_card">
                    <p>Произведено</p>
                    <span>
                      {Number(summary.produced_count)} <b>шт.</b>
                    </span>
                  </div>
                  <div className="report_card">
                    <p>Продано</p>
                    <span>
                      {Number(summary.sold_count)} <b>шт.</b>
                    </span>
                  </div>
                  <div className="report_card expense">
                    <p>Себестоимость продаж</p>
                    <span>{formatMoney(summary.cost_total)} сом</span>
                  </div>
                  <div className="report_card income">
                    <p>Выручка</p>
                    <span>{formatMoney(summary.revenue_total)} сом</span>
                  </div>
                  <div className="report_card income">
                    <p>Прибыль</p>
                    <span>{formatMoney(summary.profit_total)} сом</span>
                  </div>
                  <div className="report_card margin">
                    <p>Маржа</p>
                    <span>{summary.margin_percent}%</span>
                  </div>
                  <div className="report_card">
                    <p>Склад</p>
                    <span>{formatMoney(summary.warehouse_value)} сом</span>
                  </div>
                </div>

                {expiringSoon.length > 0 && (
                  <div className="expiring_banner">
                    <div className="expiring_banner_head">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        height="18px"
                        viewBox="0 -960 960 960"
                        width="18px"
                      >
                        <path d="M40-120l440-760 440 760H40Zm138-80h604L480-720 178-200Zm302-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-200h-80v200Zm40-100Z" />
                      </svg>
                      <span>Заканчивается срок: {expiringSoon.length}</span>
                    </div>

                    <div className="expiring_banner_list">
                      {(showAllExpiring ? expiringSoon : expiringSoon.slice(0, 5)).map((item) => (
                        <div className="expiring_row" key={item.production_id}>
                          <span className="expiring_name">
                            {item.product}
                            {item.variant ? ` — ${item.variant}` : ""} — {Number(item.count)} шт.
                            от {formatDate(item.create_dt)}
                          </span>
                          <span
                            className={`expiring_days ${item.days_left <= 0 ? "critical" : ""}`}
                          >
                            {item.days_left < 0
                              ? `истекло ${Math.abs(item.days_left)} дн. назад`
                              : item.days_left === 0
                                ? "истекло сегодня"
                                : `${item.days_left} дн.`}
                          </span>
                        </div>
                      ))}
                    </div>

                    {expiringSoon.length > 5 && (
                      <button
                        type="button"
                        className="expiring_more_btn"
                        onClick={() => setShowAllExpiring((v) => !v)}
                      >
                        {showAllExpiring ? "Скрыть" : `Ещё ${expiringSoon.length - 5}`}
                      </button>
                    )}
                  </div>
                )}

                <div className="report_columns">
                  <div className="report_table_card">
                    <h3>По товарам</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Товар</th>
                          <th>Произв.</th>
                          <th>Продано</th>
                          <th>Выручка</th>
                          <th>Прибыль</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byProduct.length === 0 ? (
                          <tr>
                            <td className="empty" colSpan={5}>
                              Нет данных
                            </td>
                          </tr>
                        ) : (
                          byProduct.map((row) => (
                            <tr key={row.product_id}>
                              <td>
                                <span className="report_row_name">{row.name}</span>
                                <span className="report_row_sub">{row.category ?? "—"}</span>
                              </td>
                              <td>{Number(row.produced_count)}</td>
                              <td>{Number(row.sold_count)}</td>
                              <td>{formatMoney(row.revenue)} сом</td>
                              <td className="profit">{formatMoney(row.profit)} сом</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="report_side_column">
                    <div className="report_table_card">
                      <h3>Расход ингредиентов</h3>
                      <table>
                        <thead>
                          <tr>
                            <th>Ингредиент</th>
                            <th>Израсход.</th>
                            <th>Стоимость</th>
                            <th>Остаток</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ingredientConsumption.length === 0 ? (
                            <tr>
                              <td className="empty" colSpan={4}>
                                Нет данных
                              </td>
                            </tr>
                          ) : (
                            ingredientConsumption.map((row) => (
                              <tr key={row.ingredient_id}>
                                <td>{row.name}</td>
                                <td>
                                  {Number(row.consumed)} {row.unit}
                                </td>
                                <td className="cost">{formatMoney(row.cost)} сом</td>
                                <td className="remaining">
                                  {Number(row.remaining)} {row.unit}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {costStructure.length > 0 && (
                      <div className="cost_structure_card">
                        <h4>Структура затрат</h4>
                        {costStructure.map((row) => (
                          <div className="cost_structure_row" key={row.ingredient_id}>
                            <div className="cost_structure_label">
                              <span>{row.name}</span>
                              <span>{row.percent}%</span>
                            </div>
                            <div className="cost_structure_bar">
                              <div
                                className="cost_structure_fill"
                                style={{ width: `${Math.min(row.percent, 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
