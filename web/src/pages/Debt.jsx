import { useCallback, useEffect, useState } from "react";
import { Navigation } from "../components/main/Navigation";
import { Pagination } from "../components/pages/Pagination";
import { DebtFormModal } from "../components/pages/DebtFormModal";
import { RepaymentModal } from "../components/pages/RepaymentModal";
import Get from "../utils/routes/get";
import Post from "../utils/routes/post";
import Del from "../utils/routes/del";
import Config from "../utils/data.jsx";
import { errorMessage, isApiError, formatMoney } from "../utils/apiHelpers";
import "../static/css/pages/debt.css";

// должно совпадать с pagination_dynamic(12) в DebtFromSupplierModelViewSet
const DEBT_PAGE_SIZE = 12;

export function Debt() {
  const { token } = Config();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalCount / DEBT_PAGE_SIZE));

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const [repaymentDebt, setRepaymentDebt] = useState(null);
  const [repaymentSubmitting, setRepaymentSubmitting] = useState(false);
  const [repaymentError, setRepaymentError] = useState(null);

  const loadDebts = useCallback(
    async (targetPage) => {
      const res = await Get(`debt/?page=${targetPage}`, token);
      if (isApiError(res)) {
        setListError(errorMessage(res, "Не удалось загрузить долги"));
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      setListError("");
      await loadDebts(1);
      setLoading(false);
    })();
  }, [loadDebts]);

  const handlePageChange = async (targetPage) => {
    setLoading(true);
    await loadDebts(targetPage);
    setLoading(false);
  };

  const totalRemaining = items.reduce(
    (sum, d) => sum + (Number(d.duty) - Number(d.paid_off)),
    0
  );

  const handleCreate = () => {
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    if (submitting) return;
    setIsFormOpen(false);
  };

  const handleSubmitForm = async ({ duty, supplierId, newSupplier }) => {
    setSubmitting(true);
    setFormError(null);

    let finalSupplierId = supplierId;

    if (newSupplier) {
      const supRes = await Post("supplier/", newSupplier, token);
      if (isApiError(supRes)) {
        setSubmitting(false);
        setFormError(supRes);
        return;
      }
      finalSupplierId = supRes.data.id;
    }

    const res = await Post("debt/", { supplier: finalSupplierId, duty }, token);

    setSubmitting(false);

    if (isApiError(res)) {
      setFormError(res);
      return;
    }

    setIsFormOpen(false);
    await loadDebts(1);
  };

  // список не отдаёт историю погашений (только её сумму) — перед открытием
  // модалки дочитываем долг детально, как Product.jsx перед правкой товара
  const handleOpenRepayment = async (item) => {
    setRepaymentError(null);
    const res = await Get(`debt/${item.id}/`, token);
    if (isApiError(res)) {
      alert(errorMessage(res, "Не удалось загрузить долг"));
      return;
    }
    setRepaymentDebt(res.data);
  };

  const handleRepaymentSubmit = async (amount) => {
    setRepaymentSubmitting(true);
    setRepaymentError(null);

    const res = await Post(
      `debt/${repaymentDebt.id}/add-repayment/`,
      { repayment_amount: amount },
      token
    );

    setRepaymentSubmitting(false);

    if (isApiError(res)) {
      setRepaymentError(res);
      return;
    }

    setRepaymentDebt(res.data);
    await loadDebts(page);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Удалить долг перед «${item.supplier_detail?.name}»?`)) return;

    const res = await Del(`debt/${item.id}/`, token);
    if (isApiError(res)) {
      alert(errorMessage(res, "Не удалось удалить долг"));
      return;
    }

    const targetPage = items.length === 1 && page > 1 ? page - 1 : page;
    await loadDebts(targetPage);
  };

  return (
    <>
      <Navigation />

      <div className="main">
        <div className="container">
          <div className="main_items">
            <div className="header header_with_action">
              <h2>Долги</h2>

              <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />

              <button type="button" className="btn_create_batch" onClick={handleCreate}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="20px"
                  viewBox="0 -960 960 960"
                  width="20px"
                >
                  <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z" />
                </svg>
                Новый долг
              </button>
            </div>

            <div className="debt_summary">
              <span className="debt_summary_label">Непогашенный остаток по всем долгам</span>
              <span className="debt_summary_value">{formatMoney(totalRemaining)} сом</span>
            </div>

            {listError && <div className="form_error_banner">{listError}</div>}

            {loading ? (
              <div className="production_journal_loading">Загрузка…</div>
            ) : (
              <div className="debt_table">
                <table>
                  <thead>
                    <tr>
                      <th>Поставщик</th>
                      <th>Сумма долга</th>
                      <th>Погашено</th>
                      <th>Остаток</th>
                      <th>Статус</th>
                      <th>Дата</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td className="empty" colSpan={7}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => {
                        const remaining = Number(item.duty) - Number(item.paid_off);
                        return (
                          <tr key={item.id}>
                            <td>
                              <span className="debt_supplier_name">
                                {item.supplier_detail?.name}
                              </span>
                              <span className="debt_supplier_tel">
                                {item.supplier_detail?.tel}
                              </span>
                            </td>
                            <td>{formatMoney(item.duty)} сом</td>
                            <td>{formatMoney(item.paid_off)} сом</td>
                            <td>
                              <span
                                className={`debt_remaining${remaining > 0 ? " warning" : ""}`}
                              >
                                {formatMoney(remaining)} сом
                              </span>
                            </td>
                            <td>
                              <span
                                className={`debt_status_badge${item.is_paid_off ? " paid" : " unpaid"}`}
                              >
                                {item.is_paid_off ? "Погашен" : "Не погашен"}
                              </span>
                            </td>
                            <td>{new Date(item.create_dt).toLocaleDateString("ru-RU")}</td>
                            <td>
                              <div className="actions">
                                <button
                                  type="button"
                                  className="action_btn repay"
                                  onClick={() => handleOpenRepayment(item)}
                                >
                                  Погасить
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
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <DebtFormModal
        open={isFormOpen}
        token={token}
        submitting={submitting}
        serverError={formError}
        onSubmit={handleSubmitForm}
        onClose={handleCloseForm}
      />

      <RepaymentModal
        open={!!repaymentDebt}
        debt={repaymentDebt}
        submitting={repaymentSubmitting}
        serverError={repaymentError}
        onSubmit={handleRepaymentSubmit}
        onClose={() => (repaymentSubmitting ? null : setRepaymentDebt(null))}
      />
    </>
  );
}
