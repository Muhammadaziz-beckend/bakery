import { useCallback, useEffect, useState } from "react";
import { Navigation } from "../components/main/Navigation";
import { Pagination } from "../components/pages/Pagination";
import { ProductFormModal } from "../components/pages/ProductFormModal";
import { ProductVariantManagerModal } from "../components/pages/ProductVariantManagerModal";
import Get from "../utils/routes/get";
import Post from "../utils/routes/post";
import Put from "../utils/routes/put";
import Del from "../utils/routes/del";
import Config from "../utils/data.jsx";
import { errorMessage, isApiError, formatMoney } from "../utils/apiHelpers";
import "../static/css/pages/product.css";

// должно совпадать с pagination_dynamic(12) в ProductModelViewSet
const PRODUCT_PAGE_SIZE = 12;

// у товара с вариантами (размерами) своей цены/остатка нет — показываем
// минимальную цену по вариантам ("от X сом") и суммарный остаток по ним
function variantMinPrice(item) {
  if (!item.variants?.length) return null;
  return Math.min(...item.variants.map((v) => Number(v.price)));
}

function variantStockSum(item) {
  if (!item.variants?.length) return null;
  return item.variants.reduce((sum, v) => sum + Number(v.count_in_warehouse), 0);
}

export function Product() {
  const { token } = Config();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PRODUCT_PAGE_SIZE));

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingItem, setEditingItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const [variantManagerProduct, setVariantManagerProduct] = useState(null);

  const loadProducts = useCallback(
    async (targetPage) => {
      const res = await Get(`product/?page=${targetPage}`, token);
      if (isApiError(res)) {
        setListError(errorMessage(res, "Не удалось загрузить товары"));
        return;
      }
      const data = res.data;
      const list = Array.isArray(data) ? data : (data?.results ?? []);
      setItems(list);
      setTotalCount(Array.isArray(data) ? list.length : (data?.count ?? list.length));
      setPage(targetPage);
    },
    [token]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      setListError("");
      await loadProducts(1);
      setLoading(false);
    })();
  }, [loadProducts]);

  const handlePageChange = async (targetPage) => {
    setLoading(true);
    await loadProducts(targetPage);
    setLoading(false);
  };

  const handleCreate = () => {
    setFormMode("create");
    setEditingItem(null);
    setFormError(null);
    setIsFormOpen(true);
  };

  // список не отдаёт рецептуру целиком (только её размер), поэтому перед
  // редактированием дочитываем товар детально — иначе форма открылась бы
  // с пустым рецептом и сохранение стёрло бы его
  const handleEdit = async (item) => {
    setFormError(null);
    const res = await Get(`product/${item.id}/`, token);
    if (isApiError(res)) {
      alert(errorMessage(res, "Не удалось загрузить товар"));
      return;
    }
    setFormMode("edit");
    setEditingItem(res.data);
    setIsFormOpen(true);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Удалить товар «${item.name}»?`)) return;

    const res = await Del(`product/${item.id}/`, token);
    if (isApiError(res)) {
      alert(errorMessage(res, "Не удалось удалить товар"));
      return;
    }

    const targetPage = items.length === 1 && page > 1 ? page - 1 : page;
    await loadProducts(targetPage);
  };

  const handleCloseForm = () => {
    if (submitting) return;
    setIsFormOpen(false);
  };

  const handleSubmitForm = async ({
    imageFile,
    removeImage,
    openVariantManagerAfterCreate,
    ...payload
  }) => {
    setSubmitting(true);
    setFormError(null);

    // PUT, а не PATCH: helper Patch принудительно шлёт multipart/form-data,
    // а вложенный массив consumptions так корректно не передать — нужен JSON
    const res =
      formMode === "edit" && editingItem
        ? await Put(`product/${editingItem.id}/`, payload, token)
        : await Post("product/", payload, token);

    if (isApiError(res)) {
      setSubmitting(false);
      setFormError(res);
      return;
    }

    const productId = formMode === "edit" ? editingItem.id : res.data.id;

    // Фото — отдельный multipart-запрос после сохранения самого товара: тело
    // с вложенным consumptions выше ушло как JSON, а файл через тот же запрос
    // multipart-парсер DRF так не разберёт (см. ProductImageSerializer).
    if (imageFile) {
      const formData = new FormData();
      formData.append("img", imageFile);
      const imgRes = await Post(`product/${productId}/upload-image/`, formData, token);
      if (isApiError(imgRes)) {
        alert(errorMessage(imgRes, "Товар сохранён, но фото загрузить не удалось"));
      }
    } else if (removeImage) {
      const imgRes = await Del(`product/${productId}/upload-image/`, token);
      if (isApiError(imgRes)) {
        alert(errorMessage(imgRes, "Товар сохранён, но фото удалить не удалось"));
      }
    }

    setSubmitting(false);
    await loadProducts(formMode === "edit" ? page : 1);
    setIsFormOpen(false);

    // товар только что создан с пометкой "с вариантами" — сразу открываем
    // менеджер, чтобы можно было добавить размеры и не искать кнопку в таблице
    if (openVariantManagerAfterCreate) {
      setVariantManagerProduct({ id: productId, name: res.data.name });
    }
  };

  const handleVariantsChanged = async () => {
    await loadProducts(page);
  };

  return (
    <>
      <Navigation />

      <div className="main">
        <div className="container">
          <div className="main_items">
            <div className="header header_with_action">
              <h2>Товары</h2>

              <Pagination
                page={page}
                totalPages={totalPages}
                onChange={handlePageChange}
              />

              <button type="button" className="btn_create_batch" onClick={handleCreate}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="20px"
                  viewBox="0 -960 960 960"
                  width="20px"
                >
                  <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z" />
                </svg>
                Создать продукт
              </button>
            </div>

            {listError && <div className="form_error_banner">{listError}</div>}

            {loading ? (
              <div className="production_journal_loading">Загрузка…</div>
            ) : (
              <div className="product_table">
                <h3>Каталог товаров</h3>

                <table>
                  <thead>
                    <tr>
                      <th>Товар</th>
                      <th>Категория</th>
                      <th>Цена</th>
                      <th>Себест.</th>
                      <th>На складе</th>
                      <th>Рецепт / варианты</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td className="empty" colSpan={7}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="product_cell">
                              {item.img ? (
                                <img src={item.img} alt="" className="product_thumb" />
                              ) : (
                                <div className="product_thumb placeholder">—</div>
                              )}
                              <div>
                                <span className="product_name">{item.name}</span>
                                <span className="product_shelf">
                                  срок годности: {item.best_before_date} дн.
                                  {item.is_semi_finished_product ? " · полуфабрикат" : ""}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="category_cell">
                              {item.category_detail?.img && (
                                <img
                                  src={item.category_detail.img}
                                  alt=""
                                  className="category_img"
                                />
                              )}
                              <span>{item.category_detail?.name ?? "—"}</span>
                            </div>
                          </td>
                          {(() => {
                            const hasVariants = item.variants?.length > 0;
                            const minPrice = variantMinPrice(item);
                            const stockSum = variantStockSum(item);
                            return (
                              <>
                                <td>
                                  {hasVariants
                                    ? `от ${formatMoney(minPrice)} сом`
                                    : item.price != null
                                      ? `${formatMoney(item.price)} сом`
                                      : "—"}
                                </td>
                                <td>
                                  {hasVariants
                                    ? "—"
                                    : item.cost_price != null
                                      ? `${formatMoney(item.cost_price)} сом`
                                      : "—"}
                                </td>
                                <td>
                                  {hasVariants
                                    ? Number(stockSum)
                                    : Number(item.count_in_warehouse)}{" "}
                                  шт.
                                </td>
                                <td>
                                  {hasVariants ? (
                                    <span className="recipe_badge good">
                                      {item.variants.length} вариант(ов)
                                    </span>
                                  ) : (
                                    <span
                                      className={`recipe_badge ${
                                        item.consumptions_count > 0 ? "good" : "warning"
                                      }`}
                                    >
                                      {item.consumptions_count > 0
                                        ? `${item.consumptions_count} ингр.`
                                        : "не задан"}
                                    </span>
                                  )}
                                </td>
                              </>
                            );
                          })()}
                          <td>
                            <div className="actions">
                              <button
                                type="button"
                                className="action_btn restock"
                                onClick={() =>
                                  setVariantManagerProduct({ id: item.id, name: item.name })
                                }
                              >
                                Варианты
                              </button>
                              <button
                                type="button"
                                className="action_btn edit"
                                onClick={() => handleEdit(item)}
                              >
                                Изменить
                              </button>
                              <button
                                type="button"
                                className="action_btn delete"
                                onClick={() => handleDelete(item)}
                              >
                                Удалить
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

      {isFormOpen && (
        <ProductFormModal
          key={editingItem?.id ?? "create"}
          open={isFormOpen}
          mode={formMode}
          token={token}
          submitting={submitting}
          serverError={formError}
          initialValues={editingItem}
          onSubmit={handleSubmitForm}
          onClose={handleCloseForm}
        />
      )}

      {variantManagerProduct && (
        <ProductVariantManagerModal
          open={!!variantManagerProduct}
          token={token}
          product={variantManagerProduct}
          onChanged={handleVariantsChanged}
          onClose={() => setVariantManagerProduct(null)}
        />
      )}
    </>
  );
}
