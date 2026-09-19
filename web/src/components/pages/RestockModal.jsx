import { useEffect, useState } from "react";
import Get from "../../utils/routes/get";
import { errorMessage, isApiError } from "../../utils/apiHelpers";
import "../../static/css/components/pages/restock_modal.css";

// Пополнение остатка — полноценный приход сырья (POST /transaction-ingredient/):
// нужен поставщик, поэтому форма даёт либо выбрать существующего, либо сразу
// завести нового (имя + телефон) прямо здесь, без отдельного перехода.
export function RestockModal({
  open,
  token,
  ingredient,
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

  const [count, setCount] = useState("");
  const [debt, setDebt] = useState("");

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

  const isValid = supplierValid && Number(count) > 0 && !loadingSuppliers;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isValid || submitting) return;

    onSubmit({
      ingredientId: ingredient.id,
      count: String(count),
      debt: debt === "" ? "0" : String(debt),
      supplierId: isNewSupplier ? null : Number(supplierId),
      newSupplier: isNewSupplier
        ? { name: newSupplierName.trim(), tel: newSupplierTel.trim() }
        : null,
    });
  };

  return (
    <div className="restock_overlay" onClick={onClose}>
      <form
        className="restock_form"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="restock_header">
          <h3>Пополнить «{ingredient.name}»</h3>
          <button
            type="button"
            className="restock_close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="restock_current">
          Сейчас на складе: <b>{Number(ingredient.count_in_warehouse)}</b>{" "}
          {ingredient.unit_detail?.short_name}
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

        <div className="field_row">
          <label className="field">
            <span className="field_label">
              Количество{ingredient.unit_detail ? `, ${ingredient.unit_detail.short_name}` : ""}
            </span>
            <input
              type="number"
              min="0"
              step="0.001"
              placeholder="0.000"
              value={count}
              onChange={(event) => setCount(event.target.value)}
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field_label">Взято в долг, сом</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={debt}
              onChange={(event) => setDebt(event.target.value)}
            />
          </label>
        </div>

        {serverError && (
          <div className="form_error_banner">
            {errorMessage(serverError, "Не удалось оформить приход")}
          </div>
        )}

        <button type="submit" className="submit_btn" disabled={!isValid || submitting}>
          {submitting ? "Сохранение…" : "Пополнить"}
        </button>
      </form>
    </div>
  );
}
