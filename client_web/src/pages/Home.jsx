import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getOrganizations } from "../api/storefront";
import { errorMessage, isApiError } from "../utils/apiHelpers";
import { useCart } from "../context/CartContext.jsx";

export function Home() {
  const navigate = useNavigate();
  const { closeOrg } = useCart();
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // На / организация ещё не выбрана — сбрасываем брендинг хедера
  // (лого/название/адрес пекарни из CartContext), если он остался
  // от предыдущего визита в /store/:orgId.
  useEffect(() => {
    closeOrg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await getOrganizations();
      if (cancelled) return;
      if (isApiError(res)) {
        setError(errorMessage(res, "Не удалось загрузить список пекарен."));
      } else {
        setOrganizations(res.data ?? []);
        setError("");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page-wrap">
      <div className="page-header">
        <h1>Пекарни</h1>
        <p className="page-hint">Выберите пекарню, чтобы посмотреть меню и сделать заказ</p>
      </div>

      {loading && <p className="table__hint">Загрузка…</p>}
      {!loading && error && <div className="alert alert-error">{error}</div>}
      {!loading && !error && organizations.length === 0 && (
        <p className="table__empty">Пока нет доступных пекарен.</p>
      )}

      <div className="org-grid">
        {organizations.map((org) => (
          <div
            key={org.id}
            className="org-card"
            role="link"
            tabIndex={0}
            onClick={() => navigate(`/store/${org.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(`/store/${org.id}`);
              }
            }}
          >
            <div className="org-card__logo">
              {org.logo ? <img src={org.logo} alt={org.name} /> : <span>🥐</span>}
            </div>
            <div className="org-card__body">
              <h2>{org.name}</h2>
              {org.address && (
                org.address_link ? (
                  <a
                    href={org.address_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="org-card__address org-card__address--link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {org.address}
                  </a>
                ) : (
                  <p className="org-card__address">{org.address}</p>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
