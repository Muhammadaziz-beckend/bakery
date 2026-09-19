import { useEffect, useState } from "react";
import Get from "../../utils/routes/get";
import { errorMessage, isApiError } from "../../utils/apiHelpers";
import "../../static/css/components/pages/debt_form_modal.css";

// Долг заводится на поставщика — тот же приём выбора/создания поставщика,
// что и в RestockModal (Warehouse.jsx): либо выбрать существующего, либо
// сразу завести нового (имя + телефон), не уходя со страницы долгов.
export function DebtFormModal({
  open,
  token,
  submitting = false,
  serverError = null,
  onSubmit,
  onClose,
}) {
  const [suppliers, setSuppliers] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);
  const [suppliersError, setSuppliersError] = useState("");

  const [supplierId, setSupplierId] = useState("");
  const [isNewSupplier, setIsNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierTel, setNewSupplierTel] = useState("");

  const [duty, setDuty] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingSuppliers(true);
      const res = await Get("supplier/", token);
      if (cancelled) return;

      if (isApiError(res)) {
        setSuppliersError(errorMessage(res, "Не удалось загрузить поставщиков"));
      } else {
        const list = Array.isArray(res.data) ? res.data : (res.data?.results ?? []);
        setSuppliers(list);
        if (list.length === 0) setIsNewSupplier(true);
      }
      setLoadingSuppliers(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!open) return null;

  const supplierValid = isNewSupplier
    ? newSupplierName.trim().length > 0 && newSupplierTel.trim().length > 0
    : !!supplierId;

  const isValid = supplierValid && Number(duty) > 0 && !loadingSuppliers;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isValid || submitting) return;

    onSubmit({
      duty: String(duty),
      supplierId: isNewSupplier ? null : Number(supplierId),
      newSupplier: isNewSupplier
        ? { name: newSupplierName.trim(), tel: newSupplierTel.trim() }
        : null,
    });
  };

  return (
    <div className="debt_form_overlay" onClick={onClose}>
      <form
        className="debt_form"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="debt_form_header">
          <h3>Новый долг перед поставщиком</h3>
          <button
            type="button"
            className="debt_form_close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {suppliersError && <div className="form_error_banner">{suppliersError}</div>}

        <label className="field">
          <span className="field_label">Поставщик</span>

          {!isNewSupplier ? (
            <div className="select_wrapper">
              <select
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                disabled={loadingSuppliers}
              >
                <option value="">— выберите поставщика —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.tel}
                  </option>
                ))}
              </select>
              <span className="select_arrow">⌄</span>
            </div>
          ) : (
            <div className="new_supplier_fields">
              <input
                type="text"
                placeholder="Название поставщика"
                value={newSupplierName}
                onChange={(event) => setNewSupplierName(event.target.value)}
              />
              <input
                type="tel"
                placeholder="+996 XXX XXX XXX"
                value={newSupplierTel}
                onChange={(event) => setNewSupplierTel(event.target.value)}
              />
            </div>
          )}

          {suppliers.length > 0 && (
            <button
              type="button"
              className="supplier_toggle"
              onClick={() => setIsNewSupplier((v) => !v)}
            >
              {isNewSupplier ? "← выбрать из списка" : "+ новый поставщик"}
            </button>
          )}
        </label>

        <label className="field">
          <span className="field_label">Сумма долга, сом</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={duty}
            onChange={(event) => setDuty(event.target.value)}
            autoFocus
          />
        </label>

        {serverError && (
          <div className="form_error_banner">
            {errorMessage(serverError, "Не удалось создать долг")}
          </div>
        )}

        <button type="submit" className="submit_btn" disabled={!isValid || submitting}>
          {submitting ? "Сохранение…" : "Создать долг"}
        </button>
      </form>
    </div>
  );
}
