import { useEffect, useState } from "react";
import { ProductVariantFormModal } from "./ProductVariantFormModal";
import Get from "../../utils/routes/get";
import Post from "../../utils/routes/post";
import Put from "../../utils/routes/put";
import Del from "../../utils/routes/del";
import { errorMessage, isApiError, formatMoney } from "../../utils/apiHelpers";
import "../../static/css/components/pages/product_variant_manager_modal.css";

function unwrapList(data) {
  return Array.isArray(data) ? data : (data?.results ?? []);
}

// /product-variant/ пагинирован (в отличие от Ingredient/Category/Unit) — для
// одного товара вариантов почти всегда меньше страницы, но менеджер должен
// показывать их все, а не молча обрезать по первой странице, если их вдруг
// окажется больше.
async function fetchAllPages(url, token) {
  let nextUrl = url;
  const acc = [];

  while (nextUrl) {
    const res = await Get(nextUrl, token);
    if (isApiError(res)) return res;

    const data = res.data;
    if (Array.isArray(data)) {
      acc.push(...data);
      nextUrl = null;
    } else {
      acc.push(...(data.results ?? []));
      nextUrl = data.next;
    }
  }

  return { data: acc };
}

// Полный CRUD вариантов (размеров) одного товара — список загружается
// заново при каждом открытии, каждый вариант редактируется/создаётся через
// ProductVariantFormModal (своя цена + своя рецептура), удаление блокируется
// backend'ом, если по варианту уже есть партии производства.
export function ProductVariantManagerModal({ open, token, product, onChanged, onClose }) {
  const [variants, setVariants] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingVariant, setEditingVariant] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const loadVariants = async () => {
    setLoading(true);
    setListError("");
    const [varRes, ingRes] = await Promise.all([
      fetchAllPages(`product-variant/?product=${product.id}`, token),
      Get("ingredient/", token),
    ]);
    if (isApiError(varRes) || isApiError(ingRes)) {
      setListError(
        errorMessage(isApiError(varRes) ? varRes : ingRes, "Не удалось загрузить варианты")
      );
    } else {
      setVariants(unwrapList(varRes.data));
      setIngredients(unwrapList(ingRes.data));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) loadVariants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id]);

  if (!open) return null;

  const handleCreate = () => {
    setFormMode("create");
    setEditingVariant(null);
    setFormError(null);
    setFormOpen(true);
  };

  const handleEdit = async (variant) => {
    setFormError(null);
    // список отдаёт консумпшены без деталей ингредиента — но для формы
    // достаточно id/count, они уже есть в variant.consumptions из списка
    setFormMode("edit");
    setEditingVariant(variant);
    setFormOpen(true);
  };

  const handleDelete = async (variant) => {
    if (!window.confirm(`Удалить вариант «${variant.name}»?`)) return;

    const res = await Del(`product-variant/${variant.id}/`, token);
    if (isApiError(res)) {
      alert(errorMessage(res, "Не удалось удалить вариант"));
      return;
    }
    await loadVariants();
    onChanged();
  };

  const handleFormSubmit = async (payload) => {
    setSubmitting(true);
    setFormError(null);

    // product обязателен на бэкенде (ProductVariant.product без null=True), а
    // Put — полный PUT без partial: нужно передавать его и при правке, не
    // только при создании, иначе DRF отвечает "product: Обязательное поле."
    const res =
      formMode === "edit" && editingVariant
        ? await Put(
            `product-variant/${editingVariant.id}/`,
            { ...payload, product: product.id },
            token
          )
        : await Post("product-variant/", { ...payload, product: product.id }, token);

    setSubmitting(false);

    if (isApiError(res)) {
      setFormError(res);
      return;
    }

    setFormOpen(false);
    await loadVariants();
    onChanged();
  };

  return (
    <div className="variant_manager_overlay" onClick={onClose}>
      <div className="variant_manager_card" onClick={(event) => event.stopPropagation()}>
        <div className="variant_manager_header">
          <h3>Варианты «{product.name}»</h3>
          <button
            type="button"
            className="variant_manager_close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <button type="button" className="variant_manager_add_btn" onClick={handleCreate}>
          + Добавить вариант
        </button>

        {listError && <div className="form_error_banner">{listError}</div>}

        {loading ? (
          <div className="variant_manager_loading">Загрузка…</div>
        ) : variants.length === 0 ? (
          <p className="variant_manager_empty">
            У товара пока нет вариантов. Добавьте первый, например «10» для размера.
          </p>
        ) : (
          <div className="variant_manager_list">
            {variants.map((variant) => (
              <div className="variant_manager_row" key={variant.id}>
                <div className="variant_row_main">
                  <span className="variant_row_name">{variant.name}</span>
                  <span className="variant_row_price">{formatMoney(variant.price)} сом</span>
                  <span className="variant_row_stock">
                    на складе: {Number(variant.count_in_warehouse)}
                  </span>
                  <span
                    className={`variant_row_recipe ${
                      variant.consumptions?.length > 0 ? "good" : "warning"
                    }`}
                  >
                    {variant.consumptions?.length > 0
                      ? `${variant.consumptions.length} ингр.`
                      : "рецепт не задан"}
                  </span>
                </div>
                <div className="variant_manager_actions">
                  <button
                    type="button"
                    className="variant_row_btn edit"
                    onClick={() => handleEdit(variant)}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    className="variant_row_btn delete"
                    onClick={() => handleDelete(variant)}
                    aria-label="Удалить"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <ProductVariantFormModal
          key={editingVariant?.id ?? "create"}
          open={formOpen}
          mode={formMode}
          ingredients={ingredients}
          initialValues={editingVariant}
          submitting={submitting}
          serverError={formError}
          onSubmit={handleFormSubmit}
          onClose={() => (submitting ? null : setFormOpen(false))}
        />
      )}
    </div>
  );
}
