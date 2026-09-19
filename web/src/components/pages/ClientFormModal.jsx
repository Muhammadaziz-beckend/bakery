import { useState } from "react";
import { errorMessage } from "../../utils/apiHelpers";
import "../../static/css/components/pages/client_form_modal.css";

export function ClientFormModal({
  open,
  mode = "create",
  initialValues,
  submitting = false,
  serverError = null,
  onSubmit,
  onClose,
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [lastName, setLastName] = useState(initialValues?.last_name ?? "");
  const [tel, setTel] = useState(initialValues?.tel ?? "");

  if (!open) return null;

  const isValid = name.trim().length > 0 && tel.trim().length > 0;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isValid || submitting) return;

    onSubmit({
      name: name.trim(),
      last_name: lastName.trim() === "" ? null : lastName.trim(),
      tel: tel.trim(),
    });
  };

  return (
    <div className="client_form_overlay" onClick={onClose}>
      <form
        className="client_form"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="client_form_header">
          <h3>{mode === "edit" ? "Изменить клиента" : "Новый клиент"}</h3>
          <button
            type="button"
            className="client_form_close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <label className="field">
          <span className="field_label">Имя</span>
          <input
            type="text"
            placeholder="Анна"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field_label">Фамилия (необязательно)</span>
          <input
            type="text"
            placeholder="Петрова"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </label>

        <label className="field">
          <span className="field_label">Телефон</span>
          <input
            type="tel"
            placeholder="+996 XXX XXX XXX"
            value={tel}
            onChange={(event) => setTel(event.target.value)}
          />
        </label>

        {serverError && (
          <div className="form_error_banner">
            {errorMessage(serverError, "Не удалось сохранить клиента")}
          </div>
        )}

        <button type="submit" className="submit_btn" disabled={!isValid || submitting}>
          {submitting
            ? "Сохранение…"
            : mode === "edit"
              ? "Сохранить изменения"
              : "Создать клиента"}
        </button>
      </form>
    </div>
  );
}
