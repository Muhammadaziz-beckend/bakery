import { useState } from "react";
import Post from "../../utils/routes/post";
import { errorMessage, isApiError } from "../../utils/apiHelpers";
import "../../static/css/components/pages/unit_select.css";

const NEW_UNIT_VALUE = "__new__";

// <select> для выбора единицы измерения с пунктом "+ Создать единицу
// измерения" в самом низу списка. Выбор этого пункта не меняет value —
// вместо этого открывается мини-форма под селектом (название + краткое имя),
// новая единица создаётся через POST /unit/ и сразу становится выбранной.
export function UnitSelect({
  value,
  units,
  token,
  onChange,
  onUnitCreated,
  disabled = false,
  formatOption = (u) => u.short_name,
  placeholder = "— выберите —",
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSelectChange = (event) => {
    const val = event.target.value;
    if (val === NEW_UNIT_VALUE) {
      setCreating(true);
      setError("");
      return;
    }
    // передумали создавать новую — выбрали существующую единицу: закрываем
    // попап, иначе select останется зажат на NEW_UNIT_VALUE (см. value ниже)
    // и визуально "откатится" обратно на "+ Создать...", а попап не исчезнет
    if (creating) {
      setCreating(false);
      setName("");
      setShortName("");
      setError("");
    }
    onChange(val);
  };

  const handleCancel = () => {
    setCreating(false);
    setName("");
    setShortName("");
    setError("");
  };

  const handleCreate = async () => {
    if (!name.trim() || !shortName.trim() || submitting) return;

    setSubmitting(true);
    setError("");

    const res = await Post(
      "unit/",
      { name: name.trim(), short_name: shortName.trim() },
      token
    );

    setSubmitting(false);

    if (isApiError(res)) {
      setError(errorMessage(res, "Не удалось создать единицу"));
      return;
    }

    onUnitCreated(res.data);
    onChange(String(res.data.id));
    setCreating(false);
    setName("");
    setShortName("");
  };

  return (
    <div className="unit_select">
      <div className="select_wrapper">
        <select
          value={creating ? NEW_UNIT_VALUE : value}
          onChange={handleSelectChange}
          disabled={disabled}
        >
          {!value && !creating && (
            <option key="" value="">
              {placeholder}
            </option>
          )}
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {formatOption(u)}
            </option>
          ))}
          <option key={NEW_UNIT_VALUE} value={NEW_UNIT_VALUE}>
            + Создать единицу измерения
          </option>
        </select>
        <span className="select_arrow">⌄</span>
      </div>

      {creating && (
        <div className="unit_create_popover">
          <input
            type="text"
            placeholder="Название (Килограмм)"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
          <input
            type="text"
            placeholder="Кратко (кг)"
            maxLength={8}
            value={shortName}
            onChange={(event) => setShortName(event.target.value)}
          />

          {error && <div className="unit_create_error">{error}</div>}

          <div className="unit_create_actions">
            <button type="button" className="unit_create_cancel" onClick={handleCancel}>
              Отмена
            </button>
            <button
              type="button"
              className="unit_create_confirm"
              disabled={!name.trim() || !shortName.trim() || submitting}
              onClick={handleCreate}
            >
              {submitting ? "…" : "Создать"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
