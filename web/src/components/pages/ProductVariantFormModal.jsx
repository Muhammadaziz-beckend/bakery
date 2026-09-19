import { useState } from "react";
import { errorMessage } from "../../utils/apiHelpers";
import "../../static/css/components/pages/product_variant_form_modal.css";

const emptyRow = () => ({ key: crypto.randomUUID(), ingredient: "", count: "" });

// Форма одного варианта товара (напр. размер "10") — название, цена,
// себестоимость и своя рецептура (расход ингредиентов на 1 единицу именно
// этого варианта). Используется и для создания, и для правки — родитель
// (ProductVariantManagerModal) решает, POST это или PUT.
export function ProductVariantFormModal({
  open,
  mode = "create",
  ingredients = [],
  initialValues,
  submitting = false,
  serverError = null,
  onSubmit,
  onClose,
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [price, setPrice] = useState(initialValues?.price ?? "");
  const [costPrice, setCostPrice] = useState(initialValues?.cost_price ?? "");
  const [rows, setRows] = useState(
    initialValues?.consumptions?.length
      ? initialValues.consumptions.map((c) => ({
          key: crypto.randomUUID(),
          ingredient: String(c.ingredient),
          count: String(c.count_ingredient),
        }))
      : []
  );

  if (!open) return null;

  const ingredientById = Object.fromEntries(ingredients.map((i) => [String(i.id), i]));
  const filledRows = rows.filter((r) => r.ingredient && Number(r.count) > 0);

  const duplicateIngredient = (() => {
    const ids = filledRows.map((r) => r.ingredient);
    return ids.length !== new Set(ids).size;
  })();

  const recipeCost = filledRows.reduce((sum, r) => {
    const ing = ingredientById[r.ingredient];
    return sum + (ing ? Number(ing.price) * Number(r.count) : 0);
  }, 0);

  const isValid = name.trim().length > 0 && Number(price) > 0 && !duplicateIngredient;

  const updateRow = (key, patch) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isValid || submitting) return;

    onSubmit({
      name: name.trim(),
      price: String(price),
      cost_price: costPrice === "" ? null : String(costPrice),
      consumptions: filledRows.map((r) => ({
        ingredient: Number(r.ingredient),
        count_ingredient: String(r.count),
      })),
    });
  };

  return (
    <div className="variant_form_overlay" onClick={onClose}>
      <form
        className="variant_form"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="variant_form_header">
          <h3>{mode === "edit" ? "Изменить вариант" : "Новый вариант"}</h3>
          <button
            type="button"
            className="variant_form_close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <label className="field">
          <span className="field_label">Название варианта</span>
          <input
            type="text"
            placeholder="Напр. 10 (размер, см)"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>

        <div className="field_row">
          <label className="field">
            <span className="field_label">Цена, сом</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field_label">Себестоимость, сом</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder={recipeCost > 0 ? recipeCost.toFixed(2) : "0.00"}
              value={costPrice}
              onChange={(event) => setCostPrice(event.target.value)}
            />
          </label>
        </div>

        <div className="recipe_block">
          <div className="recipe_head">
            <span className="field_label">Рецептура — расход на 1 единицу</span>
            <button
              type="button"
              className="recipe_add"
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
              disabled={ingredients.length === 0}
            >
              + ингредиент
            </button>
          </div>

          {ingredients.length === 0 && (
            <p className="recipe_empty">
              Ингредиентов пока нет — сначала добавьте сырьё на склад.
            </p>
          )}

          {rows.length === 0 && ingredients.length > 0 && (
            <p className="recipe_empty">
              Рецептура не задана. Без неё производство не будет списывать сырьё.
            </p>
          )}

          {rows.map((row) => {
            const ing = ingredientById[row.ingredient];
            return (
              <div className="recipe_row" key={row.key}>
                <div className="select_wrapper">
                  <select
                    value={row.ingredient}
                    onChange={(event) =>
                      updateRow(row.key, { ingredient: event.target.value })
                    }
                  >
                    <option value="">— ингредиент —</option>
                    {ingredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                  <span className="select_arrow">⌄</span>
                </div>

                <input
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="0.000"
                  value={row.count}
                  onChange={(event) => updateRow(row.key, { count: event.target.value })}
                />

                <span className="recipe_unit">{ing?.unit_detail?.short_name ?? ""}</span>

                <button
                  type="button"
                  className="recipe_remove"
                  onClick={() =>
                    setRows((prev) => prev.filter((r) => r.key !== row.key))
                  }
                  aria-label="Убрать ингредиент"
                >
                  ×
                </button>
              </div>
            );
          })}

          {recipeCost > 0 && (
            <div className="recipe_cost">
              <span>Себестоимость по рецепту</span>
              <span>{recipeCost.toFixed(2)} сом</span>
            </div>
          )}
        </div>

        {duplicateIngredient && (
          <div className="form_error_banner">
            Один и тот же ингредиент указан несколько раз.
          </div>
        )}

        {serverError && (
          <div className="form_error_banner">
            {errorMessage(serverError, "Не удалось сохранить вариант")}
          </div>
        )}

        <button type="submit" className="submit_btn" disabled={!isValid || submitting}>
          {submitting
            ? "Сохранение…"
            : mode === "edit"
              ? "Сохранить изменения"
              : "Создать вариант"}
        </button>
      </form>
    </div>
  );
}
