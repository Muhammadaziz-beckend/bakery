import { useEffect, useState } from "react";
import "../../static/css/components/pages/date_range_modal.css";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Свой период для отчёта — открывается поверх period_toggle, задаёт
// date_from/date_to и отменяет выбранный period (см. Report.jsx).
export function DateRangeModal({ open, from, to, onApply, onClose }) {
  const [draftFrom, setDraftFrom] = useState(from || "");
  const [draftTo, setDraftTo] = useState(to || todayIso());

  useEffect(() => {
    if (open) {
      setDraftFrom(from || "");
      setDraftTo(to || todayIso());
    }
  }, [open, from, to]);

  if (!open) return null;

  const isValid = draftFrom && draftTo && draftFrom <= draftTo;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isValid) return;
    onApply(draftFrom, draftTo);
  };

  return (
    <div className="date_range_overlay" onClick={onClose}>
      <form
        className="date_range_form"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="date_range_header">
          <h3>Свой период</h3>
          <button
            type="button"
            className="date_range_close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="date_range_fields">
          <label className="field">
            <span className="field_label">С</span>
            <input
              type="date"
              value={draftFrom}
              max={draftTo || todayIso()}
              onChange={(event) => setDraftFrom(event.target.value)}
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field_label">До</span>
            <input
              type="date"
              value={draftTo}
              min={draftFrom || undefined}
              max={todayIso()}
              onChange={(event) => setDraftTo(event.target.value)}
            />
          </label>
        </div>

        <button type="submit" className="submit_btn" disabled={!isValid}>
          Показать
        </button>
      </form>
    </div>
  );
}
