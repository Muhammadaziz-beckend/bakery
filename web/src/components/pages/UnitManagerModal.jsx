import { useEffect, useState } from "react";
import Get from "../../utils/routes/get";
import Post from "../../utils/routes/post";
import Put from "../../utils/routes/put";
import Del from "../../utils/routes/del";
import { errorMessage, isApiError } from "../../utils/apiHelpers";
import "../../static/css/components/pages/unit_manager_modal.css";

function unwrapList(data) {
  return Array.isArray(data) ? data : (data?.results ?? []);
}

// Полный CRUD единиц измерения — на случай, если единицу создали по ошибке
// (опечатка, дубль) прямо из UnitSelect и её нужно переименовать или убрать.
// Список подгружается сам при открытии; onChanged дёргается после любого
// успешного create/update/delete, чтобы Warehouse.jsx перечитал свой units.
export function UnitManagerModal({ open, token, onChanged, onClose }) {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [newName, setNewName] = useState("");
  const [newShortName, setNewShortName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editShortName, setEditShortName] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState(null);

  const loadUnits = async () => {
    setLoading(true);
    setListError("");
    const res = await Get("unit/", token);
    if (isApiError(res)) {
      setListError(errorMessage(res, "Не удалось загрузить единицы измерения"));
    } else {
      setUnits(unwrapList(res.data));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) loadUnits();
    // при открытии — свежий список; при закрытии сбрасывать нечего, всё
    // локальное состояние живёт только пока модалка открыта
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const startEdit = (unit) => {
    setEditingId(unit.id);
    setEditName(unit.name);
    setEditShortName(unit.short_name);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!newName.trim() || !newShortName.trim() || creating) return;

    setCreating(true);
    setCreateError(null);

    const res = await Post(
      "unit/",
      { name: newName.trim(), short_name: newShortName.trim() },
      token
    );

    setCreating(false);

    if (isApiError(res)) {
      setCreateError(res);
      return;
    }

    setNewName("");
    setNewShortName("");
    await loadUnits();
    onChanged();
  };

  const handleSaveEdit = async (unit) => {
    if (!editName.trim() || !editShortName.trim() || editSubmitting) return;

    setEditSubmitting(true);
    setEditError(null);

    const res = await Put(
      `unit/${unit.id}/`,
      { name: editName.trim(), short_name: editShortName.trim() },
      token
    );

    setEditSubmitting(false);

    if (isApiError(res)) {
      setEditError(res);
      return;
    }

    setEditingId(null);
    await loadUnits();
    onChanged();
  };

  const handleDelete = async (unit) => {
    if (!window.confirm(`Удалить единицу измерения «${unit.name}»?`)) return;

    const res = await Del(`unit/${unit.id}/`, token);
    if (isApiError(res)) {
      alert(errorMessage(res, "Не удалось удалить единицу измерения"));
      return;
    }
    await loadUnits();
    onChanged();
  };

  return (
    <div className="unit_manager_overlay" onClick={onClose}>
      <div className="unit_manager_card" onClick={(event) => event.stopPropagation()}>
        <div className="unit_manager_header">
          <h3>Единицы измерения</h3>
          <button
            type="button"
            className="unit_manager_close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <form className="unit_manager_add_row" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="Название (Килограмм)"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <input
            type="text"
            placeholder="Кратко (кг)"
            maxLength={8}
            value={newShortName}
            onChange={(event) => setNewShortName(event.target.value)}
          />
          <button
            type="submit"
            className="unit_manager_add_btn"
            disabled={!newName.trim() || !newShortName.trim() || creating}
          >
            {creating ? "…" : "+ Добавить"}
          </button>
        </form>

        {createError && (
          <div className="form_error_banner">
            {errorMessage(createError, "Не удалось создать единицу")}
          </div>
        )}

        {listError && <div className="form_error_banner">{listError}</div>}

        {loading ? (
          <div className="unit_manager_loading">Загрузка…</div>
        ) : (
          <div className="unit_manager_list">
            {units.length === 0 ? (
              <p className="unit_manager_empty">Единиц измерения пока нет.</p>
            ) : (
              units.map((unit) => (
                <div className="unit_manager_row" key={unit.id}>
                  {editingId === unit.id ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        autoFocus
                      />
                      <input
                        type="text"
                        maxLength={8}
                        value={editShortName}
                        onChange={(event) => setEditShortName(event.target.value)}
                      />
                      <div className="unit_manager_actions">
                        <button
                          type="button"
                          className="unit_row_btn save"
                          disabled={
                            !editName.trim() || !editShortName.trim() || editSubmitting
                          }
                          onClick={() => handleSaveEdit(unit)}
                        >
                          {editSubmitting ? "…" : "Сохранить"}
                        </button>
                        <button
                          type="button"
                          className="unit_row_btn cancel"
                          onClick={cancelEdit}
                        >
                          Отмена
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="unit_row_name">{unit.name}</span>
                      <span className="unit_row_short">{unit.short_name}</span>
                      <div className="unit_manager_actions">
                        <button
                          type="button"
                          className="unit_row_btn edit"
                          onClick={() => startEdit(unit)}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="unit_row_btn delete"
                          onClick={() => handleDelete(unit)}
                          aria-label="Удалить"
                        >
                          ×
                        </button>
                      </div>
                    </>
                  )}

                  {editingId === unit.id && editError && (
                    <div className="form_error_banner unit_row_error">
                      {errorMessage(editError, "Не удалось сохранить")}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
