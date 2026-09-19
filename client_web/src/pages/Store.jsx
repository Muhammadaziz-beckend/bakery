import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getCategories, getProducts } from "../api/storefront";
import { errorMessage, formatMoney, isApiError } from "../utils/apiHelpers";
import { useCart } from "../context/CartContext.jsx";

function CategoryOption({ category, depth, activeId, onSelect }) {
  return (
    <>
      <button
        type="button"
        className={`store-cat ${activeId === category.id ? "store-cat--active" : ""}`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={() => onSelect(category.id)}
      >
        {category.name}
      </button>
      {category.children?.map((child) => (
        <CategoryOption
          key={child.id}
          category={child}
          depth={depth + 1}
          activeId={activeId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function ProductCard({ product, onAdd }) {
  const hasVariants = product.variants && product.variants.length > 0;
  const [variantId, setVariantId] = useState(hasVariants ? product.variants[0].id : null);
  const [qty, setQty] = useState(1);

  const variant = hasVariants ? product.variants.find((v) => v.id === Number(variantId)) : null;
  const price = variant ? variant.price : product.price;
  const inStock = product.in_stock;

  return (
    <div className={`product-card ${!inStock ? "product-card--out" : ""}`}>
      <div className="product-card__img">
        {product.img ? <img src={product.img} alt={product.name} /> : <span>🍞</span>}
      </div>
      <div className="product-card__body">
        <h3 className="product-card__name">{product.name}</h3>
        <p className="product-card__price">{formatMoney(price)} с</p>

        {hasVariants && (
          <select
            className="product-card__variant"
            value={variantId ?? ""}
            onChange={(e) => setVariantId(e.target.value)}
          >
            {product.variants.map((v) => (
              <option key={v.id} value={v.id} disabled={!v.in_stock}>
                {v.name} — {formatMoney(v.price)} с{!v.in_stock ? " (нет в наличии)" : ""}
              </option>
            ))}
          </select>
        )}

        {!inStock && <p className="product-card__stock">Нет в наличии</p>}

        <div className="product-card__actions">
          <div className="qty-stepper">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))}>
              −
            </button>
            <span>{qty}</span>
            <button type="button" onClick={() => setQty((q) => q + 1)}>
              +
            </button>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!inStock}
            onClick={() => onAdd(product, variant, qty)}
          >
            В корзину
          </button>
        </div>
      </div>
    </div>
  );
}

export function Store() {
  const { orgId } = useParams();
  const { openOrg, addItem, orgId: activeOrgId } = useCart();

  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [justAdded, setJustAdded] = useState("");

  useEffect(() => {
    if (String(activeOrgId) !== String(orgId)) openOrg(orgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getCategories(orgId);
      if (!cancelled && !isApiError(res)) setCategories(res.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await getProducts(
        orgId,
        activeCategory ? { category: activeCategory, page: 1 } : { page: 1 }
      );
      if (cancelled) return;
      if (isApiError(res)) {
        setError(errorMessage(res, "Не удалось загрузить товары."));
        setProducts([]);
        setHasMore(false);
      } else {
        setProducts(res.data?.results ?? res.data ?? []);
        setHasMore(Boolean(res.data?.next));
        setPage(1);
        setError("");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, activeCategory]);

  const handleLoadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    const res = await getProducts(
      orgId,
      activeCategory ? { category: activeCategory, page: nextPage } : { page: nextPage }
    );
    if (!isApiError(res)) {
      setProducts((prev) => [...prev, ...(res.data?.results ?? [])]);
      setHasMore(Boolean(res.data?.next));
      setPage(nextPage);
    }
    setLoadingMore(false);
  };

  const handleAdd = (product, variant, qty) => {
    addItem(product, variant, qty);
    setJustAdded(`${product.name}${variant ? ` (${variant.name})` : ""} добавлен в корзину`);
    window.clearTimeout(handleAdd._t);
    handleAdd._t = window.setTimeout(() => setJustAdded(""), 2000);
  };

  const catList = useMemo(() => categories, [categories]);

  return (
    <div className="page-wrap store-layout">
      <aside className="store-sidebar">
        <button
          type="button"
          className={`store-cat ${activeCategory === null ? "store-cat--active" : ""}`}
          onClick={() => setActiveCategory(null)}
        >
          Все товары
        </button>
        {catList.map((cat) => (
          <CategoryOption
            key={cat.id}
            category={cat}
            depth={0}
            activeId={activeCategory}
            onSelect={setActiveCategory}
          />
        ))}
      </aside>

      <div className="store-main">
        {justAdded && <div className="alert alert-success">{justAdded}</div>}
        {error && <div className="alert alert-error">{error}</div>}
        {loading && <p className="table__hint">Загрузка…</p>}
        {!loading && !error && products.length === 0 && (
          <p className="table__empty">В этой категории пока нет товаров.</p>
        )}

        <div className="product-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} onAdd={handleAdd} />
          ))}
        </div>

        {hasMore && (
          <div className="load-more">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Загрузка…" : "Показать ещё"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
