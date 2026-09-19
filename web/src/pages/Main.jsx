import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Navigation } from "../components/main/Navigation";
import Get from "../utils/routes/get";
import Config from "../utils/data.jsx";
import { errorMessage, isApiError, formatMoney } from "../utils/apiHelpers";
import { ORDER_STATUS_LABELS } from "../utils/orderConstants";
import "../static/css/pages/main.css";

// столько же используется в ProductionJournal.jsx/report.py (EXPIRY_WARNING_DAYS)
const EXPIRY_WARNING_DAYS = 2;

function unwrapList(data) {
  return Array.isArray(data) ? data : (data?.results ?? []);
}

function daysLeftFrom(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function daysLeftLabel(daysLeft) {
  if (daysLeft < 0) return "истекло";
  if (daysLeft === 0) return "сегодня";
  return `${daysLeft}д.`;
}

export function Main() {
  const { token } = Config();

  const today = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const [summary, setSummary] = useState(null);
  const [expiringSoon, setExpiringSoon] = useState([]);
  const [byProduct, setByProduct] = useState([]);
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [recentBatches, setRecentBatches] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [productById, setProductById] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError("");

      const [reportRes, ordersCountRes, batchesRes, ordersRes, productsRes] =
        await Promise.all([
          Get("report/?period=today", token),
          Get("order/?status=pending&page=1", token),
          Get("production/?ordering=-create_dt&page=1", token),
          Get("order/?ordering=-create_dt&page=1", token),
          Get("product/?limit=100", token),
        ]);
      if (cancelled) return;

      if (isApiError(reportRes)) {
        setLoadError(errorMessage(reportRes, "Не удалось загрузить сводку"));
      } else {
        setSummary(reportRes.data.summary);
        setExpiringSoon(reportRes.data.expiring_soon ?? []);
        setByProduct(reportRes.data.by_product ?? []);
      }

      if (!isApiError(ordersCountRes)) {
        const data = ordersCountRes.data;
        setNewOrdersCount(Array.isArray(data) ? data.length : (data?.count ?? 0));
      }

      if (!isApiError(batchesRes)) {
        setRecentBatches(unwrapList(batchesRes.data).slice(0, 3));
      }

      if (!isApiError(ordersRes)) {
        setRecentOrders(unwrapList(ordersRes.data).slice(0, 3));
      }

      if (!isApiError(productsRes)) {
        const list = unwrapList(productsRes.data);
        setProductById(Object.fromEntries(list.map((p) => [p.id, p])));
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const assortment = byProduct.slice(0, 4);

  return (
    <>
      <Navigation />
      <div className="main">
        <div className="container">
          <div className="main_items">
            <div className="header">
              <h2>Добро пожаловать</h2>
              <p className="date">{today}</p>
            </div>

            {loadError && <div className="form_error_banner">{loadError}</div>}

            {loading ? (
              <div className="production_journal_loading">Загрузка…</div>
            ) : (
              <>
                <div className="main_information_blokes">
                  <NavLink to="/production/" className="main_information_blok">
                    <p>Произведено сегодня</p>
                    <span>
                      {Number(summary?.produced_count ?? 0)} <b>шт</b>
                    </span>
                  </NavLink>
                  <NavLink to="/report/" className="main_information_blok expense">
                    <p>Себестоимость продаж</p>
                    <span>{formatMoney(summary?.cost_total ?? 0)} сом</span>
                  </NavLink>
                  <NavLink to="/report/" className="main_information_blok income">
                    <p>Выручка сегодня</p>
                    <span>{formatMoney(summary?.revenue_total ?? 0)} сом</span>
                  </NavLink>
                  <NavLink to="/order/" className="main_information_blok">
                    <p>Новые заказы</p>
                    <span>{newOrdersCount}</span>
                  </NavLink>
                  <NavLink to="/warehouse/" className="main_information_blok">
                    <p>Склад</p>
                    <span>{formatMoney(summary?.warehouse_value ?? 0)} сом</span>
                  </NavLink>
                </div>

                {expiringSoon.length > 0 && (
                  <NavLink to="/production/" className="dashboard_expiring_banner">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="18px"
                      viewBox="0 -960 960 960"
                      width="18px"
                    >
                      <path d="M40-120l440-760 440 760H40Zm138-80h604L480-720 178-200Zm302-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-200h-80v200Zm40-100Z" />
                    </svg>
                    <span className="dashboard_expiring_text">
                      {expiringSoon.length}{" "}
                      {expiringSoon.length === 1 ? "партия истекает" : "партии истекают"} в
                      ближайшие {EXPIRY_WARNING_DAYS} дня
                    </span>
                    <span className="dashboard_expiring_link">Смотреть →</span>
                  </NavLink>
                )}

                <div className="dashboard_columns">
                  <div className="dashboard_card">
                    <div className="dashboard_card_head">
                      <h3>Последние партии</h3>
                      <NavLink to="/production/">Все →</NavLink>
                    </div>

                    {recentBatches.length === 0 ? (
                      <p className="dashboard_empty">Пока нет партий производства</p>
                    ) : (
                      <div className="dashboard_list">
                        {recentBatches.map((b) => {
                          const product = productById[b.product_id];
                          const daysLeft = b.best_before_date
                            ? daysLeftFrom(b.best_before_date)
                            : null;
                          return (
                            <div className="dashboard_list_row" key={b.id}>
                              <div className="dashboard_list_icon">
                                {product?.img ? (
                                  <img src={product.img} alt="" />
                                ) : (
                                  <span>—</span>
                                )}
                              </div>
                              <div className="dashboard_list_main">
                                <span className="dashboard_list_name">
                                  {b.product}
                                  {b.variant_name ? ` (${b.variant_name})` : ""}
                                </span>
                                <span className="dashboard_list_sub">
                                  {b.create_dt?.slice(0, 10)}
                                </span>
                              </div>
                              <div className="dashboard_list_meta">
                                <span className="dashboard_list_count">
                                  {Number(b.count)} шт.
                                </span>
                                {b.is_sold ? (
                                  <span className="dashboard_days_badge">Продано</span>
                                ) : (
                                  daysLeft !== null && (
                                    <span
                                      className={`dashboard_days_badge${
                                        daysLeft <= EXPIRY_WARNING_DAYS ? " warning" : ""
                                      }`}
                                    >
                                      {daysLeftLabel(daysLeft)}
                                    </span>
                                  )
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="dashboard_card">
                    <div className="dashboard_card_head">
                      <h3>Заказы клиентов</h3>
                      <NavLink to="/order/">Все →</NavLink>
                    </div>

                    {recentOrders.length === 0 ? (
                      <p className="dashboard_empty">Пока нет заказов</p>
                    ) : (
                      <div className="dashboard_list">
                        {recentOrders.map((o) => (
                          <div className="dashboard_list_row" key={o.id}>
                            <div className="dashboard_list_main">
                              <span className="dashboard_list_name">
                                {o.client_detail?.name} {o.client_detail?.last_name || ""}
                              </span>
                              <span className="dashboard_list_sub">
                                {o.client_detail?.tel}
                              </span>
                            </div>
                            <div className="dashboard_list_meta">
                              <span className="dashboard_list_count">
                                {formatMoney(o.total_prise)} сом
                              </span>
                              <span
                                className={`dashboard_status_badge status_${o.status.replace(" ", "_")}`}
                              >
                                {ORDER_STATUS_LABELS[o.status] ?? o.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="dashboard_card">
                  <div className="dashboard_card_head">
                    <h3>Ассортимент</h3>
                    <NavLink to="/product/">Управлять →</NavLink>
                  </div>

                  {assortment.length === 0 ? (
                    <p className="dashboard_empty">Товаров пока нет</p>
                  ) : (
                    <div className="dashboard_assortment_grid">
                      {assortment.map((row) => {
                        const product = productById[row.product_id];
                        const marginPercent =
                          Number(row.revenue) > 0
                            ? Math.round((Number(row.profit) / Number(row.revenue)) * 100)
                            : null;
                        return (
                          <NavLink
                            to="/product/"
                            className="dashboard_assortment_card"
                            key={row.product_id}
                          >
                            <div className="dashboard_assortment_icon">
                              {product?.img ? <img src={product.img} alt="" /> : <span>—</span>}
                            </div>
                            <span className="dashboard_assortment_name">{row.name}</span>
                            <span className="dashboard_assortment_sub">
                              {row.category ?? "—"}
                              {product?.best_before_date ? ` · ${product.best_before_date}д.` : ""}
                            </span>
                            <div className="dashboard_assortment_footer">
                              <span className="dashboard_assortment_price">
                                {formatMoney(product?.price ?? 0)} сом
                              </span>
                              {marginPercent !== null && (
                                <span
                                  className={`dashboard_margin_badge${
                                    marginPercent < 0 ? " down" : ""
                                  }`}
                                >
                                  {marginPercent > 0 ? "+" : ""}
                                  {marginPercent}%
                                </span>
                              )}
                            </div>
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
