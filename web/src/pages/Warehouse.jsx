import { useCallback, useEffect, useState } from "react";
import { Navigation } from "../components/main/Navigation";
import { IngredientEditModal } from "../components/pages/IngredientEditModal";
import { RestockModal } from "../components/pages/RestockModal";
import { UnitSelect } from "../components/pages/UnitSelect";
import { UnitManagerModal } from "../components/pages/UnitManagerModal";
import Get from "../utils/routes/get";
import Post from "../utils/routes/post";
import Put from "../utils/routes/put";
import Del from "../utils/routes/del";
import Config from "../utils/data.jsx";
import { errorMessage, isApiError, formatMoney } from "../utils/apiHelpers";
import "../static/css/pages/warehouse.css";

function unwrapList(data) {
  return Array.isArray(data) ? data : (data?.results ?? []);
}

const emptyAddForm = { name: "", unit: "", count: "0", price: "" };

export function Warehouse() {
  const { token } = Config();

  const [ingredients, setIngredients] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [addForm, setAddForm] = useState(emptyAddForm);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);

  const [editingIngredient, setEditingIngredient] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState(null);

  const [restockingIngredient, setRestockingIngredient] = useState(null);
  const [restockSubmitting, setRestockSubmitting] = useState(false);
  const [restockError, setRestockError] = useState(null);

  const [unitManagerOpen, setUnitManagerOpen] = useState(false);

  const loadIngredients = useCallback(async () => {
    const res = await Get("ingredient/", token);
    if (isApiError(res)) {
      setListError(errorMessage(res, "Не удалось загрузить ингредиенты"));
      return;
    }
    setIngredients(unwrapList(res.data));
  }, [token]);

  const loadUnits = useCallback(async () => {
    const res = await Get("unit/", token);
    if (isApiError(res)) {
      setListError(errorMessage(res, "Не удалось загрузить единицы измерения"));
      return;
    }
    const list = unwrapList(res.data);
    setUnits(list);
    setAddForm((prev) => (prev.unit ? prev : { ...prev, unit: list[0]?.id ?? "" }));
  }, [token]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setListError("");
      await Promise.all([loadIngredients(), loadUnits()]);
      setLoading(false);
    })();
  }, [loadIngredients, loadUnits]);

  const totalCost = ingredients.reduce(
    (sum, i) => sum + Number(i.count_in_warehouse) * Number(i.price),
    0
  );

  const isAddValid =
    addForm.name.trim().length > 0 && !!addForm.unit && Number(addForm.price) > 0;

  const handleAddSubmit = async (event) => {
    event.preventDefault();
    if (!isAddValid || adding) return;

    setAdding(true);
    setAddError(null);

    const res = await Post(
      "ingredient/",
      {
        name: addForm.name.trim(),
        unit: Number(addForm.unit),
        count_in_warehouse: String(addForm.count || "0"),
        limit_warnings: 0,
        price: String(addForm.price),
      },
      token
    );

    setAdding(false);

    if (isApiError(res)) {
      setAddError(res);
      return;
    }

    setAddForm({ ...emptyAddForm, unit: addForm.unit });
    await loadIngredients();
  };

  const handleDelete = async (ingredient) => {
    if (!window.confirm(`Удалить ингредиент «${ingredient.name}»?`)) return;

    const res = await Del(`ingredient/${ingredient.id}/`, token);
    if (isApiError(res)) {
      alert(errorMessage(res, "Не удалось удалить ингредиент"));
      return;
    }
    await loadIngredients();
  };

  const handleEditSubmit = async (payload) => {
    setEditSubmitting(true);
    setEditError(null);

    const res = await Put(`ingredient/${editingIngredient.id}/`, payload, token);

    setEditSubmitting(false);

    if (isApiError(res)) {
      setEditError(res);
      return;
    }

    setEditingIngredient(null);
    await loadIngredients();
  };

  // Пополнение — полноценный приход: при необходимости сначала заводим
  // поставщика, затем одним запросом создаём приход с одной позицией
  // (ingredient/count) — тот же механизм, что использовался бы для прихода
  // сразу нескольких ингредиентов.
  const handleRestockSubmit = async ({ ingredientId, count, debt, supplierId, newSupplier }) => {
    setRestockSubmitting(true);
    setRestockError(null);

    let finalSupplierId = supplierId;

    if (newSupplier) {
      const supRes = await Post("supplier/", newSupplier, token);
      if (isApiError(supRes)) {
        setRestockSubmitting(false);
        setRestockError(supRes);
        return;
      }
      finalSupplierId = supRes.data.id;
    }

    const res = await Post(
      "transaction-ingredient/",
      {
        suppler: finalSupplierId,
        debt_from_supplier: debt,
        items: [{ ingredient: ingredientId, count }],
      },
      token
    );

    setRestockSubmitting(false);

    if (isApiError(res)) {
      setRestockError(res);
      return;
    }

    setRestockingIngredient(null);
    await loadIngredients();
  };

  return (
    <>
      <Navigation />

      <div className="main">
        <div className="container">
          <div className="main_items">
            <div className="header warehouse_header">
              <h2>Склад</h2>
              <div className="warehouse_summary">
                <span className="warehouse_summary_label">Стоимость склада</span>
                <span className="warehouse_summary_value">
                  {formatMoney(totalCost)} сом
                </span>
              </div>
            </div>

            {listError && <div className="form_error_banner">{listError}</div>}

            <form className="ingredient_add_card" onSubmit={handleAddSubmit}>
              <div className="ingredient_add_card_header">
                <h3>Добавить ингредиент</h3>
                <button
                  type="button"
                  className="unit_manage_link"
                  onClick={() => setUnitManagerOpen(true)}
                >
                  Единицы измерения
                </button>
              </div>

              <div className="ingredient_add_row">
                <label className="field">
                  <span className="field_label">Название</span>
                  <input
                    type="text"
                    placeholder="Мука пшеничная"
                    value={addForm.name}
                    onChange={(event) =>
                      setAddForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                  />
                </label>

                <label className="field field_unit">
                  <span className="field_label">Ед.</span>
                  <UnitSelect
                    value={addForm.unit}
                    units={units}
                    token={token}
                    disabled={loading}
                    placeholder="нет единиц"
                    onChange={(unitId) =>
                      setAddForm((prev) => ({ ...prev, unit: unitId }))
                    }
                    onUnitCreated={(unit) => setUnits((prev) => [...prev, unit])}
                  />
                </label>

                <label className="field field_narrow">
                  <span className="field_label">Остаток</span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="0"
                    value={addForm.count}
                    onChange={(event) =>
                      setAddForm((prev) => ({ ...prev, count: event.target.value }))
                    }
                  />
                </label>

                <label className="field field_narrow">
                  <span className="field_label">Цена / ед. (сом)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={addForm.price}
                    onChange={(event) =>
                      setAddForm((prev) => ({ ...prev, price: event.target.value }))
                    }
                  />
                </label>

                <button
                  type="submit"
                  className="ingredient_add_btn"
                  disabled={!isAddValid || adding || units.length === 0}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="20px"
                    viewBox="0 -960 960 960"
                    width="20px"
                  >
                    <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z" />
                  </svg>
                  {adding ? "Добавление…" : "Добавить"}
                </button>
              </div>

              {addError && (
                <div className="form_error_banner">
                  {errorMessage(addError, "Не удалось добавить ингредиент")}
                </div>
              )}
            </form>

            {loading ? (
              <div className="production_journal_loading">Загрузка…</div>
            ) : (
              <div className="ingredient_table">
                <table>
                  <thead>
                    <tr>
                      <th>Ингредиент</th>
                      <th>Ед.</th>
                      <th>Остаток</th>
                      <th>Цена / ед.</th>
                      <th>Стоимость</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.length === 0 ? (
                      <tr>
                        <td className="empty" colSpan={6}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      ingredients.map((ing) => (
                        <tr key={ing.id}>
                          <td>
                            <span className="ingredient_name">{ing.name}</span>
                          </td>
                          <td>{ing.unit_detail?.short_name}</td>
                          <td>
                            <span
                              className={`ingredient_count${ing.is_below_limit ? " warning" : ""}`}
                            >
                              {Number(ing.count_in_warehouse)}
                            </span>
                          </td>
                          <td>{formatMoney(ing.price)} сом</td>
                          <td>
                            {formatMoney(Number(ing.count_in_warehouse) * Number(ing.price))}{" "}
                            сом
                          </td>
                          <td>
                            <div className="actions">
                              <button
                                type="button"
                                className="action_btn restock"
                                onClick={() => {
                                  setRestockError(null);
                                  setRestockingIngredient(ing);
                                }}
                              >
                                +Пополнить
                              </button>
                              <button
                                type="button"
                                className="action_btn edit"
                                onClick={() => {
                                  setEditError(null);
                                  setEditingIngredient(ing);
                                }}
                              >
                                Изменить
                              </button>
                              <button
                                type="button"
                                className="action_btn delete"
                                onClick={() => handleDelete(ing)}
                                aria-label="Удалить"
                              >
                                ×
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {editingIngredient && (
        <IngredientEditModal
          open={!!editingIngredient}
          units={units}
          token={token}
          onUnitCreated={(unit) => setUnits((prev) => [...prev, unit])}
          ingredient={editingIngredient}
          submitting={editSubmitting}
          serverError={editError}
          onSubmit={handleEditSubmit}
          onClose={() => (editSubmitting ? null : setEditingIngredient(null))}
        />
      )}

      {restockingIngredient && (
        <RestockModal
          open={!!restockingIngredient}
          token={token}
          ingredient={restockingIngredient}
          submitting={restockSubmitting}
          serverError={restockError}
          onSubmit={handleRestockSubmit}
          onClose={() => (restockSubmitting ? null : setRestockingIngredient(null))}
        />
      )}

      {unitManagerOpen && (
        <UnitManagerModal
          open={unitManagerOpen}
          token={token}
          onChanged={loadUnits}
          onClose={() => setUnitManagerOpen(false)}
        />
      )}
    </>
  );
}
