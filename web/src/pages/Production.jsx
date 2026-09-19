import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigation } from "../components/main/Navigation";
import { ProductionJournal } from "../components/pages/ProductionJournal";
import { BatchFormModal } from "../components/pages/BatchFormModal";
import { Pagination } from "../components/pages/Pagination";
import Get from "../utils/routes/get";
import Post from "../utils/routes/post";
import Patch from "../utils/routes/patch";
import Del from "../utils/routes/del";
import Config from "../utils/data.jsx";
import { errorMessage, isApiError } from "../utils/apiHelpers";
import "../static/css/pages/production.css";

function unwrapList(data) {
  return Array.isArray(data) ? data : (data?.results ?? []);
}

// должно совпадать с pagination_dynamic(12) в ProductProductionModelViewSet
const PRODUCTION_PAGE_SIZE = 12;

function mapProduction(item) {
  const sales = item.sales ?? [];
  return {
    id: item.id,
    productId: item.product_id,
    variantId: item.variant_id,
    variantName: item.variant_name,
    name: item.product,
    count: Number(item.count),
    bestBeforeDate: item.best_before_date,
    isSold: item.is_sold,
    sales,
    soldCount: sales.reduce((sum, s) => sum + Number(s.count), 0),
    createDt: item.create_dt,
  };
}

export function Production() {
  const { token } = Config();

  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PRODUCTION_PAGE_SIZE));
  // "active" — ещё не проданные партии (по умолчанию, срок годности актуален),
  // "sold" — проданные партии (срок годности уже не важен, см. ProductionJournal)
  const [filter, setFilter] = useState("active");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingItem, setEditingItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const loadProducts = useCallback(async () => {
    // limit=100 — у product/ пагинация по 12, а тут нужен весь каталог для
    // выбора товара и для карты себестоимости ниже
    const res = await Get("product/?limit=100", token);
    if (isApiError(res)) {
      setListError(errorMessage(res, "Не удалось загрузить товары"));
      return;
    }
    setProducts(unwrapList(res.data));
  }, [token]);

  // targetPage всегда передаётся явно (а не берётся из стейта page) и сам же
  // синхронизирует стейт page — так вызывающий код (пагинация, создание,
  // удаление) не гадает, нужно ли отдельно дёргать setPage.
  const loadProductions = useCallback(
    async (targetPage, targetFilter) => {
      const isSold = targetFilter === "sold";
      const res = await Get(
        `production/?page=${targetPage}&is_sold=${isSold}`,
        token
      );
      if (isApiError(res)) {
        setListError(errorMessage(res, "Не удалось загрузить партии производства"));
        return;
      }
      const data = res.data;
      const list = unwrapList(data);
      setItems(list.map(mapProduction));
      setTotalCount(Array.isArray(data) ? list.length : (data?.count ?? list.length));
      setPage(targetPage);
    },
    [token]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      setListError("");
      await Promise.all([loadProducts(), loadProductions(1, filter)]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProducts, loadProductions]);

  const handlePageChange = async (targetPage) => {
    setLoading(true);
    await loadProductions(targetPage, filter);
    setLoading(false);
  };

  const handleFilterChange = async (nextFilter) => {
    if (nextFilter === filter) return;
    setFilter(nextFilter);
    setLoading(true);
    await loadProductions(1, nextFilter);
    setLoading(false);
  };

  const productsById = useMemo(() => {
    const map = {};
    products.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [products]);

  // себестоимость партии считаем на фронте (cost_price * count) — сам backend
  // её для партии не хранит и не отдаёт. Если у партии указан вариант, берём
  // cost_price именно варианта (у него своя себестоимость), иначе — товара.
  const displayItems = useMemo(
    () =>
      items.map((item) => {
        const product = productsById[item.productId];
        const variant = item.variantId
          ? product?.variants?.find((v) => v.id === item.variantId)
          : null;
        const costPriceSource = item.variantId ? variant?.cost_price : product?.cost_price;
        const costPrice =
          costPriceSource != null
            ? Math.round(Number(costPriceSource) * item.count * 100) / 100
            : null;
        return { ...item, costPrice };
      }),
    [items, productsById]
  );

  const handleCreateBatch = () => {
    setFormMode("create");
    setEditingItem(null);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleEdit = (item) => {
    setFormMode("edit");
    setEditingItem(item);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleDelete = async (item) => {
    if (item.soldCount > 0) return; // кнопка задизейблена в журнале — доп. подстраховка

    if (!window.confirm(`Удалить партию «${item.name}» (${item.count} шт.)?`)) return;

    const res = await Del(`production/${item.id}/`, token);
    if (isApiError(res)) {
      alert(errorMessage(res, "Не удалось удалить партию"));
      return;
    }

    // если это была последняя запись на странице — уходим на предыдущую,
    // иначе просто перечитываем текущую (позиции внутри неё могли сдвинуться)
    const targetPage = items.length === 1 && page > 1 ? page - 1 : page;
    await loadProductions(targetPage, filter);
  };

  const handleCloseForm = () => {
    if (submitting) return;
    setIsFormOpen(false);
  };

  const handleSubmitForm = async ({ productId, variantId, quantity }) => {
    setSubmitting(true);
    setFormError(null);

    const res =
      formMode === "edit" && editingItem
        ? await Patch(`production/${editingItem.id}/`, { count: String(quantity) }, token)
        : await Post(
            "production/",
            {
              product: productId,
              variant: variantId || null,
              count: String(quantity),
            },
            token
          );

    setSubmitting(false);

    if (isApiError(res)) {
      setFormError(res);
      return;
    }

    // новая партия попадёт в начало списка — переходим на первую страницу;
    // при редактировании остаёмся там, где были
    await loadProductions(formMode === "edit" ? page : 1, filter);
    setIsFormOpen(false);
  };

  return (
    <>
      <Navigation />
      <div className="main">
        <div className="container">
          <div className="main_items">
            <div className="header header_with_action">
              <h2>Производство</h2>

              <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />

              <button
                type="button"
                className="btn_create_batch"
                onClick={handleCreateBatch}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="20px"
                  viewBox="0 -960 960 960"
                  width="20px"
                >
                  <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z" />
                </svg>
                Создать новую партию
              </button>
            </div>

            <div className="production_filter_tabs">
              <button
                type="button"
                className={`production_filter_tab${filter === "active" ? " active" : ""}`}
                onClick={() => handleFilterChange("active")}
              >
                Активные
              </button>
              <button
                type="button"
                className={`production_filter_tab${filter === "sold" ? " active" : ""}`}
                onClick={() => handleFilterChange("sold")}
              >
                Проданные
              </button>
            </div>

            {listError && <div className="form_error_banner">{listError}</div>}

            {loading ? (
              <div className="production_journal_loading">Загрузка…</div>
            ) : (
              <ProductionJournal
                items={displayItems}
                showExpiry={filter !== "sold"}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )}
          </div>
        </div>
      </div>

      {isFormOpen && (
        <BatchFormModal
          open={isFormOpen}
          mode={formMode}
          products={products}
          token={token}
          submitting={submitting}
          serverError={formError}
          initialValues={
            editingItem
              ? {
                  productId: editingItem.productId,
                  variantId: editingItem.variantId,
                  variantName: editingItem.variantName,
                  quantity: editingItem.count,
                  minQuantity: editingItem.soldCount,
                }
              : null
          }
          onSubmit={handleSubmitForm}
          onClose={handleCloseForm}
        />
      )}
    </>
  );
}
