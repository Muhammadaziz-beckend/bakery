import { Navigate, useLocation } from "react-router-dom";
import Config from "../utils/data.jsx";

// Оборачивает страницы, которые требуют входа (заказы, профиль, оформление
// заказа) — без токена отправляет на /login и запоминает, куда вернуться.
export function RequireAuth({ children }) {
  const { token } = Config();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
