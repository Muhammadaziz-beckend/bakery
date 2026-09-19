import { Link, useNavigate } from "react-router-dom";
import Config from "../utils/data.jsx";
import { useCart } from "../context/CartContext.jsx";

export function Header() {
  const navigate = useNavigate();
  const { token, customer, logout } = Config();
  const { orgId, org, count, homeOrgId } = useCart();
  // На выделенном поддомене организации (ali.maximumcomfort.pro) "/" ведёт
  // обратно в эту же витрину — идти там больше некуда, список пекарен с
  // этого домена недоступен, поэтому стрелку назад не показываем.
  const isDedicatedOrgHost = Boolean(homeOrgId);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <header className="shop-header">
      <div className="shop-header__inner">
        {orgId && org ? (
          <div className="shop-header__brand-group">
            {!isDedicatedOrgHost && (
              <Link to="/" className="shop-header__back" aria-label="К списку пекарен" title="К списку пекарен">
                ←
              </Link>
            )}
            <Link to={`/store/${orgId}`} className="shop-header__brand shop-header__brand--org">
              <span className="shop-header__logo">
                {org.logo ? <img src={org.logo} alt={org.name} /> : <span>🥐</span>}
              </span>
              <span className="shop-header__brand-text">
                <span className="shop-header__brand-name">{org.name}</span>
                {org.address && (
                  <span className="shop-header__brand-address">{org.address}</span>
                )}
              </span>
            </Link>
          </div>
        ) : (
          <Link to="/" className="shop-header__brand">
            🥐 Bakery Market
          </Link>
        )}

        <nav className="shop-header__nav">
          {orgId && (
            <Link to={`/store/${orgId}/cart`} className="shop-header__cart">
              🧺 Корзина
              {count > 0 && <span className="shop-header__cart-badge">{count}</span>}
            </Link>
          )}

          {token ? (
            <>
              <Link to="/orders" className="shop-header__link">
                Мои заказы
              </Link>
              <Link to="/profile" className="shop-header__link">
                {customer?.name || "Профиль"}
              </Link>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="shop-header__link">
                Войти
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                Регистрация
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
