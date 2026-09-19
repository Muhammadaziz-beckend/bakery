import { useEffect, useState } from "react";
import Get from "../../utils/routes/get";
import { errorMessage, isApiError } from "../../utils/apiHelpers";
import "../../static/css/components/pages/batch_form_modal.css";

// Форма создания/редактирования партии.
// - products: список товаров (GET /product/, без рецептуры).
// - при выборе товара подгружается GET /product/:id/ с полями consumptions
//   и variants — на их основе считается расход ингредиентов и нехватка сырья
//   ещё до отправки. Если у товара есть варианты (размеры), нужно выбрать
//   конкретный — расход/остаток/себестоимость берутся из variants.consumptions,
//   а не из consumptions самого товара.
// - onSubmit получает { productId, variantId, quantity } — create -> POST
//   /production/, edit -> PATCH /production/:id/ (сам запрос выполняет
//   родитель Production.jsx).
// - serverError — необработанный ответ axios с ошибкой от backend (для показа
//   структурированной нехватки сырья, если она всплыла именно на сервере).
export function BatchFormModal({
  open,
  mode = "create",
  products = [],
  token,
  initialValues,
  submitting = false,
  serverError = null,
  onSubmit,
  onClose,
}) {
  const [productId, setProductId] = useState(
    initialValues?.productId ?? products[0]?.id ?? ""
  );
  const [variantId, setVariantId] = useState(initialValues?.variantId ?? "");
  const [quantity, setQuantity] = useState(
    initialValues?.quantity ? String(initialValues.quantity) : ""
  );
  const [productDetail, setProductDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");

  const minQuantity = initialValues?.minQuantity ?? 0;

  useEffect(() => {
    if (!productId && products.length > 0) {
      setProductId(products[0].id);
    }
  }, [products, productId]);

  useEffect(() => {
    if (!productId) {
      setProductDetail(null);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    setDetailError("");

    (async () => {
      const res = await Get(`product/${productId}/`, token);
      if (cancelled) return;

      if (isApiError(res)) {
        setDetailError(errorMessage(res, "Не удалось загрузить рецептуру товара"));
        setProductDetail(null);
      } else {
        setProductDetail(res.data);
        // при смене товара сбрасываем выбор варианта (кроме edit-режима,
        // где вариант зафиксирован и меняться не должен)
        if (mode !== "edit") {
          const variants = res.data?.variants ?? [];
          setVariantId(variants.length === 1 ? variants[0].id : "");
        }
      }
      setLoadingDetail(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, token]);

  if (!open) return null;

  const qty = Number(quantity) || 0;
  const variants = productDetail?.variants ?? [];
  const hasVariants = variants.length > 0;
  const selectedVariant = hasVariants
    ? variants.find((v) => String(v.id) === String(variantId))
    : null;

  // расход/остаток берём из выбранного варианта, если у товара вообще есть
  // варианты — у товара самого по себе тогда нет ни цены, ни рецептуры
  const recipeSource = hasVariants ? selectedVariant : productDetail;

  const consumptionRows = (recipeSource?.consumptions ?? []).map((c) => {
    const detail = c.ingredient_detail;
    const perUnit = Number(c.count_ingredient);
    const available = Number(detail?.count_in_warehouse ?? 0);
    const needed = perUnit * qty;

    return {
      ingredientId: c.ingredient,
      name: detail?.name ?? `Ингредиент #${c.ingredient}`,
      unit: detail?.unit ?? "",
      needed,
      available,
      insufficient: needed > available,
    };
  });

  const shortageRows = consumptionRows.filter((row) => row.insufficient);

  const costPrice =
    recipeSource?.cost_price != null
      ? Math.round(Number(recipeSource.cost_price) * qty * 100) / 100
      : null;

  const belowMin = mode === "edit" && qty < minQuantity;

  const isValid =
    qty > 0 &&
    !!productId &&
    (!hasVariants || !!variantId) &&
    !loadingDetail &&
    shortageRows.length === 0 &&
    !belowMin;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isValid || submitting) return;
    onSubmit({
      productId: Number(productId),
      variantId: variantId ? Number(variantId) : null,
      quantity: qty,
    });
  };

  // Серверная ошибка при создании партии — DRF присылает
  // { count: [...], shortages: [{ ingredient_id, ingredient, needed, available }] }.
  // Имя/единицу ингредиента подменяем на уже загруженные consumptionRows —
  // строка из backend (Ingredient.__str__) не предназначена для показа пользователю.
  const serverShortages = serverError?.response?.data?.shortages;
  const serverMessage = serverError
    ? errorMessage(serverError, "Не удалось сохранить партию")
    : "";

  return (
    <div className="batch_form_overlay" onClick={onClose}>
      <form
        className="batch_form"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="batch_form_header">
          <h3>{mode === "edit" ? "Изменить партию" : "Новая партия"}</h3>
          <button
            type="button"
            className="batch_form_close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <label className="field">
          <span className="field_label">Товар</span>
          <div className="select_wrapper">
            <select
              value={productId}
              disabled={mode === "edit" || products.length === 0}
              onChange={(event) => setProductId(event.target.value)}
            >
              {products.length === 0 && <option value="">Нет доступных товаров</option>}
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="select_arrow">⌄</span>
          </div>
        </label>

        {hasVariants && (
          <label className="field">
            <span className="field_label">Вариант (размер)</span>
            <div className="select_wrapper">
              <select
                value={variantId}
                disabled={mode === "edit" || loadingDetail}
                onChange={(event) => setVariantId(event.target.value)}
              >
                <option value="">— выберите вариант —</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.price} сом
                  </option>
                ))}
              </select>
              <span className="select_arrow">⌄</span>
            </div>
          </label>
        )}

        <label className="field">
          <span className="field_label">Количество (шт.)</span>
          <input
            type="number"
            min={minQuantity || 0}
            placeholder="0"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
          {belowMin && (
            <span className="field_hint error">
              Уже продано {minQuantity} шт. — нельзя указать меньше.
            </span>
          )}
        </label>

        {loadingDetail && <div className="ingredients_loading">Загрузка рецептуры…</div>}
        {detailError && <div className="form_error_banner">{detailError}</div>}

        {qty > 0 && productDetail && !loadingDetail && (!hasVariants || selectedVariant) && (
          <div className="ingredients_summary">
            <span className="ingredients_title">Расход ингредиентов</span>

            {consumptionRows.length === 0 && (
              <div className="ingredients_row">
                <span>Рецептура {hasVariants ? "для этого варианта" : "для этого товара"} не задана</span>
              </div>
            )}

            {consumptionRows.map((row) => (
              <div
                className={`ingredients_row${row.insufficient ? " insufficient" : ""}`}
                key={row.ingredientId}
              >
                <span>{row.name}</span>
                <span>
                  {row.needed.toFixed(3)} {row.unit}
                  {row.insufficient &&
                    ` (на складе ${row.available.toFixed(3)} ${row.unit})`}
                </span>
              </div>
            ))}

            {costPrice != null && (
              <div className="ingredients_row cost">
                <span>Себестоимость</span>
                <span>{costPrice.toFixed(2)} сом</span>
              </div>
            )}

            {productDetail.best_before_date != null && (
              <div className="ingredients_row shelf_life">
                <span>Срок годности</span>
                <span>+{productDetail.best_before_date} дней</span>
              </div>
            )}
          </div>
        )}

        {shortageRows.length > 0 && (
          <div className="form_error_banner">
            Недостаточно сырья на складе: {shortageRows.map((row) => row.name).join(", ")}
          </div>
        )}

        {serverError && (
          <div className="form_error_banner">
            {serverMessage}
            {Array.isArray(serverShortages) && serverShortages.length > 0 && (
              <ul>
                {serverShortages.map((shortage, idx) => {
                  const match = consumptionRows.find(
                    (row) => String(row.ingredientId) === String(shortage.ingredient_id)
                  );
                  const name = match?.name ?? shortage.ingredient;
                  const unit = match?.unit ?? "";
                  return (
                    <li key={idx}>
                      {name}: нужно {shortage.needed} {unit}, на складе {shortage.available}{" "}
                      {unit}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <button type="submit" className="submit_btn" disabled={!isValid || submitting}>
          {submitting
            ? "Сохранение…"
            : mode === "edit"
              ? "Сохранить изменения"
              : "Произвести партию"}
        </button>
      </form>
    </div>
  );
}
