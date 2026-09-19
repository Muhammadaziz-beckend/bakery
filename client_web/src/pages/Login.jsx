import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { login } from "../api/storefront";
import { errorMessage, isApiError } from "../utils/apiHelpers";
import Config from "../utils/data.jsx";

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, setToken, setCustomer } = Config();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const from = location.state?.from?.pathname ?? "/";

  useEffect(() => {
    if (token) navigate(from, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const isValid = phone.trim().length > 0 && password.length > 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    setError("");

    const res = await login({ phone: phone.trim(), password });
    if (isApiError(res)) {
      setError(errorMessage(res, "Не удалось войти. Проверьте номер и пароль."));
      setSubmitting(false);
      return;
    }

    setToken(res.data);
    setCustomer(res.data.customer);
    navigate(from, { replace: true });
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Вход</h1>
        <p className="page-hint">Войдите, чтобы оформлять заказы и видеть их историю</p>

        <label className="field">
          <span>Номер телефона</span>
          <input
            type="tel"
            placeholder="+996 XXX XXX XXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            autoFocus
          />
        </label>

        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && <div className="alert alert-error">{error}</div>}

        <button type="submit" className="btn btn-primary btn-block" disabled={!isValid || submitting}>
          {submitting ? "Вход…" : "Войти"}
        </button>

        <p className="auth-switch">
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </form>
    </div>
  );
}
