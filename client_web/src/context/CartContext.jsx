import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getOrganization, resolveOrganizationByHost } from "../api/storefront";
import { isApiError } from "../utils/apiHelpers";

const CartContext = createContext(null);

function storageKey(orgId) {
  return `cart_org_${orgId}`;
}

function readCart(orgId) {
  if (!orgId) return [];
  try {
    const raw = localStorage.getItem(storageKey(orgId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCart(orgId, items) {
  if (!orgId) return;
  try {
    localStorage.setItem(storageKey(orgId), JSON.stringify(items));
  } catch {
    // корзина просто не переживёт перезагрузку — не критично
  }
}

// Ключ строки корзины — товар+вариант (у товара с вариантами разные размеры
// это разные позиции, как и в заказе на бэкенде, см. OrderItemInlineSerializer
// на бэкенде — apps/order/serializers/order.py).
function lineKey(productId, variantId) {
  return `${productId}:${variantId ?? ""}`;
}

// Корзина — своя для каждой организации (пекарни): у одной пекарни нет
// рецепта/склада другой, поэтому один чек не может смешивать товары разных
// организаций. openOrg(orgId) переключает контекст на корзину нужной пекарни
// и вызывается при входе в /store/:orgId.
export function CartProvider({ children }) {
  const [orgId, setOrgId] = useState(null);
  const [org, setOrg] = useState(null);
  const [items, setItems] = useState([]);
  const requestedIdRef = useRef(null);

  // Если сайт открыт по выделенному поддомену/домену организации
  // (ali.maximumcomfort.pro), с этого хоста нет пути "назад к списку
  // пекарен" — такого списка тут просто нет, домен целиком принадлежит
  // одной организации. Резолвим это один раз при старте приложения, чтобы
  // и Home (редирект на /store/:id), и Header (скрыть "← к списку пекарен")
  // могли на это опереться.
  const [homeOrgId, setHomeOrgId] = useState(null);
  const [homeResolved, setHomeResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await resolveOrganizationByHost(window.location.hostname);
      if (cancelled) return;
      if (!isApiError(res) && res.data?.id) {
        setHomeOrgId(res.data.id);
      }
      setHomeResolved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Логотип, название и адрес пекарни нужны в хедере (Header.jsx) сразу
  // после выбора организации на / — тянем их сюда же, чтобы не заводить
  // отдельный контекст только под карточку организации.
  const openOrg = useCallback((id) => {
    setOrgId(id);
    setItems(readCart(id));
    setOrg(null);
    requestedIdRef.current = id;
    if (!id) return;
    getOrganization(id).then((res) => {
      if (!isApiError(res) && String(id) === String(requestedIdRef.current)) {
        setOrg(res.data);
      }
    });
  }, []);

  const closeOrg = useCallback(() => {
    setOrgId(null);
    setOrg(null);
    setItems([]);
  }, []);

  const addItem = useCallback(
    (product, variant, qty = 1) => {
      const key = lineKey(product.id, variant?.id ?? null);
      const price = Number(variant ? variant.price : product.price) || 0;
      setItems((prev) => {
        const existing = prev.find((i) => lineKey(i.productId, i.variantId) === key);
        const next = existing
          ? prev.map((i) =>
              lineKey(i.productId, i.variantId) === key ? { ...i, qty: i.qty + qty } : i
            )
          : [
              ...prev,
              {
                productId: product.id,
                variantId: variant?.id ?? null,
                name: product.name,
                variantName: variant?.name ?? null,
                price,
                img: product.img ?? null,
                qty,
              },
            ];
        writeCart(orgId, next);
        return next;
      });
    },
    [orgId]
  );

  const updateQty = useCallback(
    (productId, variantId, qty) => {
      const key = lineKey(productId, variantId);
      setItems((prev) => {
        const next =
          qty <= 0
            ? prev.filter((i) => lineKey(i.productId, i.variantId) !== key)
            : prev.map((i) =>
                lineKey(i.productId, i.variantId) === key ? { ...i, qty } : i
              );
        writeCart(orgId, next);
        return next;
      });
    },
    [orgId]
  );

  const removeItem = useCallback(
    (productId, variantId) => updateQty(productId, variantId, 0),
    [updateQty]
  );

  const clear = useCallback(() => {
    setItems([]);
    writeCart(orgId, []);
  }, [orgId]);

  const count = useMemo(() => items.reduce((sum, i) => sum + i.qty, 0), [items]);
  const total = useMemo(() => items.reduce((sum, i) => sum + i.price * i.qty, 0), [items]);

  const value = useMemo(
    () => ({
      orgId,
      org,
      items,
      openOrg,
      closeOrg,
      addItem,
      updateQty,
      removeItem,
      clear,
      count,
      total,
      homeOrgId,
      homeResolved,
    }),
    [
      orgId,
      org,
      items,
      openOrg,
      closeOrg,
      addItem,
      updateQty,
      removeItem,
      clear,
      count,
      total,
      homeOrgId,
      homeResolved,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
