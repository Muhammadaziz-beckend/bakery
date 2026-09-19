import { useState } from "react";
import { errorMessage, isApiError } from "../../utils/apiHelpers";
import "../../static/css/components/pages/repayment_modal.css";

// Показывает остаток долга и историю уже сделанных погашений, форма
// добавляет ровно одно новое погашение за раз (POST .../add-repayment/).
export function RepaymentModal({
  open,
  debt,
  submitting = false,
  serverError = null,
  onSubmit,
  onClose,
}) {
  const [amount, setAmount] = useState("");

  if (!open || !debt) return null;

  const remaining = Number(debt.duty) - Number(debt.paid_off);
  const isValid = Number(amount) > 0 && Number(amount) <= remaining;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isValid || submitting) return;
    onSubmit(String(amount));
  };

  return (
    <div className="repayment_overlay" onClick={onClose}>
      <form
        className="repayment_form"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="repayment_header">
          <h3>Погашение долга — {debt.supplier_detail?.name}</h3>
          <button
            type="button"
            className="repayment_close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="repayment_summary">
          <div>
            <span className="repayment_summary_label">Сумма долга</span>
            <span>{Number(debt.duty).toFixed(2)} сом</span>
          </div>
          <div>
            <span className="repayment_summary_label">Погашено</span>
            <span>{Number(debt.paid_off).toFixed(2)} сом</span>
          </div>
          <div>
            <span className="repayment_summary_label">Остаток</span>
            <span className="repayment_remaining">{remaining.toFixed(2)} сом</span>
          </div>
        </div>

        {debt.repayment_amounts?.length > 0 && (
          <div className="repayment_history">
            <span className="field_label">История погашений</span>
            <ul>
              {debt.repayment_amounts.map((item) => (
                <li key={item.id}>
                  <span>{Number(item.repayment_amount).toFixed(2)} сом</span>
                  <span className="repayment_history_date">
                    {new Date(item.create_dt).toLocaleDateString("ru-RU")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!debt.is_paid_off && (
          <label className="field">
            <span className="field_label">Сумма погашения, сом</span>
            <input
              type="number"
              min="0"
              max={remaining}
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              autoFocus
            />
          </label>
        )}

        {serverError && (
          <div className="form_error_banner">
            {errorMessage(serverError, "Не удалось сохранить погашение")}
          </div>
        )}

        {!debt.is_paid_off ? (
          <button type="submit" className="submit_btn" disabled={!isValid || submitting}>
            {submitting ? "Сохранение…" : "Погасить"}
          </button>
        ) : (
          <div className="repayment_paid_off">Долг полностью погашен</div>
        )}
      </form>
    </div>
  );
}
