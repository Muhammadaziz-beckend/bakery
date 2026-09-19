import { useEffect, useState } from "react";
import Get from "../../utils/routes/get";
import { errorMessage, isApiError } from "../../utils/apiHelpers";
import "../../static/css/components/pages/product_form_modal.css";

// Категории приходят деревом (GET /category/tree/) — для <select> разворачиваем
// его в плоский список, сохраняя уровень вложенности для отступа в названии.
function flattenTree(nodes, level = 0, acc = []) {
  nodes.forEach((node) => {
    acc.push({ id: node.id, name: node.name, level });
    if (node.children?.length) flattenTree(node.children, level + 1, acc);
  });
  return acc;
}

const emptyRow = () => ({ key: crypto.randomUUID(), ingredient: "", count: "" });

export function ProductFormModal({
  open,
  mode = "create",
  token,
  initialValues,
  submitting = false,
  serverError = null,
  onSubmit,
  onClose,
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [categoryId, setCategoryId] = useState(initialValues?.category ?? "");
  const [price, setPrice] = useState(initialValues?.price ?? "");
  const [costPrice, setCostPrice] = useState(initialValues?.cost_price ?? "");
  const [shelfLife, setShelfLife] = useState(initialValues?.best_before_date ?? "1");
  const [limitWarnings, setLimitWarnings] = useState(
    initialValues?.limit_warnings ?? "0"
  );
  const [dailyOrderLimit, setDailyOrderLimit] = useState(
    initialValues?.daily_order_limit ?? "0"
  );
  const [isSemiFinished, setIsSemiFinished] = useState(
    initialValues?.is_semi_finished_product ?? false
  );

  // Варианты (размеры) — опция для товаров типа тортов: своя цена и своя
  // рецептура на каждый размер. Заводятся не здесь, а отдельным экраном
  // («Варианты» в таблице товаров, см. ProductVariantManagerModal) — при
  // создании эта форма только помечает намерение (см. handleSubmit), а
  // Product.jsx после успешного создания товара сразу открывает менеджер
  // вариантов. При правке уже существующего товара с вариантами эта форма
  // просто скрывает цену/рецептуру (они не используются) и не даёт их
  // создать по-новой отсюда — только через тот же менеджер.
  const existingVariantsCount = initialValues?.variants?.length ?? 0;
  const isEditWithVariants = mode === "edit" && existingVariantsCount > 0;
  const [hasVariants, setHasVariants] = useState(false);
  const usesVariants = isEditWithVariants || hasVariants;

  const [rows, setRows] = useState(
    initialValues?.consumptions?.length
      ? initialValues.consumptions.map((c) => ({
          key: crypto.randomUUID(),
          ingredient: String(c.ingredient),
          count: String(c.count_ingredient),
        }))
      : []
  );

  const [categories, setCategories] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [refsError, setRefsError] = useState("");

  // Фото грузится отдельным multipart-запросом после сохранения самого товара
  // (см. Product.jsx) — здесь только собираем файл и локальный превью.
  const existingImg = initialValues?.img ?? null;
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingRefs(true);
      const [catRes, ingRes] = await Promise.all([
        Get("category/tree/", token),
        Get("ingredient/", token),
      ]);
      if (cancelled) return;

      if (isApiError(catRes) || isApiError(ingRes)) {
        setRefsError(
          errorMessage(
            isApiError(catRes) ? catRes : ingRes,
            "Не удалось загрузить категории и ингредиенты"
          )
        );
      } else {
        const tree = Array.isArray(catRes.data) ? catRes.data : [];
        setCategories(flattenTree(tree));
        const ing = Array.isArray(ingRes.data)
          ? ingRes.data
          : (ingRes.data?.results ?? []);
        setIngredients(ing);
      }
      setLoadingRefs(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!open) return null;

  const ingredientById = Object.fromEntries(ingredients.map((i) => [String(i.id), i]));

  const filledRows = rows.filter((r) => r.ingredient && Number(r.count) > 0);

  const duplicateIngredient = (() => {
    const ids = filledRows.map((r) => r.ingredient);
    return ids.length !== new Set(ids).size;
  })();

  // себестоимость по рецептуре — сумма (цена ингредиента × расход на единицу)
  const recipeCost = filledRows.reduce((sum, r) => {
    const ing = ingredientById[r.ingredient];
    return sum + (ing ? Number(ing.price) * Number(r.count) : 0);
  }, 0);

  const priceRequired = !isSemiFinished && !usesVariants;
  const isValid =
    name.trim().length > 0 &&
    !!categoryId &&
    (!priceRequired || Number(price) > 0) &&
    Number(shelfLife) > 0 &&
    !duplicateIngredient &&
    !loadingRefs;

  const updateRow = (key, patch) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const displayImg = removeImage ? null : (previewUrl ?? existingImg);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setRemoveImage(false);
    event.target.value = "";
  };

  const handleRemoveImage = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(null);
    setPreviewUrl(null);
    setRemoveImage(true);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isValid || submitting) return;

    onSubmit({
      name: name.trim(),
      category: Number(categoryId),
      // у товара с вариантами цена/себестоимость/рецепт не используются —
      // сами варианты задаются отдельно (см. ProductVariantManagerModal),
      // но backend всё равно требует price — шлём безобидный плейсхолдер
      price: usesVariants ? "0" : price === "" ? null : String(price),
      cost_price: usesVariants ? null : costPrice === "" ? null : String(costPrice),
      best_before_date: Number(shelfLife),
      limit_warnings: Number(limitWarnings) || 0,
      daily_order_limit: Number(dailyOrderLimit) || 0,
      is_semi_finished_product: usesVariants ? false : isSemiFinished,
      consumptions: usesVariants
        ? []
        : filledRows.map((r) => ({
            ingredient: Number(r.ingredient),
            count_ingredient: String(r.count),
          })),
      imageFile,
      // если выбран новый файл — он и так заменит старое фото, отдельно
      // удалять перед этим не нужно
      removeImage: removeImage && !imageFile,
      // Product.jsx: после успешного создания товара с этим флагом сразу
      // открывает менеджер вариантов для только что созданного товара
      openVariantManagerAfterCreate: mode === "create" && hasVariants,
    });
  };

  return (
    <div className="product_form_overlay" onClick={onClose}>
      <form
        className="product_form"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="product_form_header">
          <h3>{mode === "edit" ? "Изменить товар" : "Новый товар"}</h3>
          <button
            type="button"
            className="product_form_close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {refsError && <div className="form_error_banner">{refsError}</div>}

        <div className="image_field">
          <div className="image_preview">
            {displayImg ? (
              <img src={displayImg} alt="" />
            ) : (
              <span className="image_placeholder">Нет фото</span>
            )}
          </div>
          <div className="image_actions">
            <label className="image_upload_btn">
              {displayImg ? "Заменить фото" : "Загрузить фото"}
              <input type="file" accept="image/*" onChange={handleFileChange} hidden />
            </label>
            {displayImg && (
              <button
                type="button"
                className="image_remove_btn"
                onClick={handleRemoveImage}
              >
                Удалить фото
              </button>
            )}
          </div>
        </div>

        <label className="field">
          <span className="field_label">Название</span>
          <input
            type="text"
            placeholder="Напр. Хлеб белый"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field_label">Категория</span>
          <div className="select_wrapper">
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={loadingRefs}
            >
              <option value="">— выберите категорию —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {"  ".repeat(c.level)}
                  {c.level > 0 ? "└ " : ""}
                  {c.name}
                </option>
              ))}
            </select>
            <span className="select_arrow">⌄</span>
          </div>
        </label>

        {mode === "create" && (
          <label className="field_checkbox">
            <input
              type="checkbox"
              checked={hasVariants}
              onChange={(event) => setHasVariants(event.target.checked)}
            />
            <span>
              Товар с вариантами (например, размеры торта — у каждого своя
              цена и свой расход)
            </span>
          </label>
        )}

        {usesVariants ? (
          <div className="variants_hint">
            {mode === "edit"
              ? `У товара ${existingVariantsCount} вариант(ов) — цена, себестоимость и рецептура задаются в них. Управляйте вариантами через кнопку «Варианты» в списке товаров.`
              : "Цену, себестоимость и рецептуру для каждого размера можно будет добавить сразу после создания товара."}
          </div>
        ) : (
          <div className="field_row">
            <label className="field">
              <span className="field_label">
                Цена, сом{priceRequired ? "" : " (необязательно)"}
              </span>
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
        )}

        <div className="field_row">
          <label className="field">
            <span className="field_label">Срок годности, дней</span>
            <input
              type="number"
              min="1"
              placeholder="1"
              value={shelfLife}
              onChange={(event) => setShelfLife(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field_label">Лимит предупреждения</span>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={limitWarnings}
              onChange={(event) => setLimitWarnings(event.target.value)}
            />
          </label>
        </div>

        <label className="field">
          <span className="field_label">Лимит заказов в день</span>
          <input
            type="number"
            min="0"
            step="1"
            placeholder="0"
            value={dailyOrderLimit}
            onChange={(event) => setDailyOrderLimit(event.target.value)}
          />
          <span className="field_hint">
            Сколько штук этого товара (суммарно по всем вариантам) можно принять
            в заказы на одну дату. 0 — без ограничения. Особый лимит на
            конкретную дату (напр. праздник) можно задать на странице «Заказы».
          </span>
        </label>

        {!usesVariants && (
          <>
            <label className="field_checkbox">
              <input
                type="checkbox"
                checked={isSemiFinished}
                onChange={(event) => setIsSemiFinished(event.target.checked)}
              />
              <span>Полуфабрикат (цена необязательна)</span>
            </label>

            <div className="recipe_block">
              <div className="recipe_head">
                <span className="field_label">Рецептура — расход на 1 единицу</span>
                <button
                  type="button"
                  className="recipe_add"
                  onClick={() => setRows((prev) => [...prev, emptyRow()])}
                  disabled={loadingRefs || ingredients.length === 0}
                >
                  + ингредиент
                </button>
              </div>

              {ingredients.length === 0 && !loadingRefs && (
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
                      onChange={(event) =>
                        updateRow(row.key, { count: event.target.value })
                      }
                    />

                    <span className="recipe_unit">
                      {ing?.unit_detail?.short_name ?? ""}
                    </span>

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
          </>
        )}

        {serverError && (
          <div className="form_error_banner">
            {errorMessage(serverError, "Не удалось сохранить товар")}
          </div>
        )}

        <button type="submit" className="submit_btn" disabled={!isValid || submitting}>
          {submitting
            ? "Сохранение…"
            : mode === "edit"
              ? "Сохранить изменения"
              : "Создать товар"}
        </button>
      </form>
    </div>
  );
}
