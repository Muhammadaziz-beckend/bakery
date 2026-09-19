import { useState } from "react";
import { UnitSelect } from "./UnitSelect";
import { errorMessage } from "../../utils/apiHelpers";
import "../../static/css/components/pages/ingredient_edit_modal.css";

// Правка карточки ингредиента: название/единица/лимит/цена. Остаток
// (count_in_warehouse) сюда намеренно не входит — после создания он меняется
// только через приход (см. RestockModal) или расход на производство,
// backend такой PUT/PATCH просто игнорирует поле, если его передать.
export function IngredientEditModal({
  open,
  units,
  token,
  onUnitCreated,
  ingredient,
  submitting = false,
  serverError = null,
  onSubmit,
  onClose,
}) {
  const [name, setName] = useState(ingredient?.name ?? "");
  const [unitId, setUnitId] = useState(ingredient?.unit ?? "");
  const [limitWarnings, setLimitWarnings] = useState(
    ingredient?.limit_warnings != null ? String(ingredient.limit_warnings) : "0"
  );
  const [price, setPrice] = useState(ingredient?.price ?? "");

  if (!open) return null;

  const isValid = name.trim().length > 0 && !!unitId && Number(price) > 0;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isValid || submitting) return;

    onSubmit({
      name: name.trim(),
      unit: Number(unitId),
      limit_warnings: Number(limitWarnings) || 0,
      price: String(price),
    });
  };

  return (
    <div className="ingredient_edit_overlay" onClick={onClose}>
      <form
        className="ingredient_edit_form"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="ingredient_edit_header">
          <h3>Изменить ингредиент</h3>
          <button
            type="button"
            className="ingredient_edit_close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <label className="field">
          <span className="field_label">Название</span>
          <input
            type="text"
            placeholder="Напр. Мука пшеничная"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>

        <div className="field_row">
          <label className="field">
            <span className="field_label">Ед. измерения</span>
            <UnitSelect
              value={unitId}
              units={units}
              token={token}
              onChange={setUnitId}
              onUnitCreated={onUnitCreated}
              formatOption={(u) => `${u.name} (${u.short_name})`}
            />
          </label>

          <label className="field">
            <span className="field_label">Цена / ед., сом</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </label>
        </div>

        <label className="field">
          <span className="field_label">Лимит предупреждения</span>
          <input
            type="number"
            min="0"
            placeholder="0"
            value={limitWarnings}
            onChange={(event) => setLimitWarnings(event.target.value)}
          />
          <span className="field_hint">
            Когда остаток опускается до этого значения или ниже, ингредиент
            помечается как заканчивающийся.
          </span>
        </label>

        {serverError && (
          <div className="form_error_banner">
            {errorMessage(serverError, "Не удалось сохранить ингредиент")}
          </div>
        )}

        <button type="submit" className="submit_btn" disabled={!isValid || submitting}>
          {submitting ? "Сохранение…" : "Сохранить изменения"}
        </button>
      </form>
    </div>
  );
}
