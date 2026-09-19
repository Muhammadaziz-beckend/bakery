import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Config from "../utils/data.jsx";
import Get from "../utils/routes/get";
import { errorMessage, isApiError } from "../utils/apiHelpers";
import "../static/css/pages/login.css";

// Отдельный axios-запрос (не через utils/routes/post.js) — тот использует
// общий api-инстанс с перехватчиком, который на 401 форсит редирект на /login;
// для самой формы логина нужен контроль над ошибкой без скрытого редиректа.
export function Login() {
  const navigate = useNavigate();
  const { url, token, setToken, setOrganization, setIsOwner } = Config();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (token) navigate("/", { replace: true });
  }, [token, navigate]);

  const isValid = phone.trim().length > 0 && password.length > 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await axios.post(`${url}auth/login/`, {
        phone: phone.trim(),
        password,
      });
      setToken(res.data);

      // Лого/название организации для шапки (Navigation.jsx) — обновляем
      // в localStorage сразу при входе, чтобы дальше не дёргать /auth/me/
      // на каждый рендер. Если запрос не удался — не блокируем вход,
      // шапка просто покажет заглушку до следующего успешного логина.
      const meRes = await Get("auth/me/", res.data?.token);
      if (!isApiError(meRes)) {
        setOrganization(meRes.data?.organization ?? null);
        setIsOwner(!!meRes.data?.is_owner);
      }

      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Не удалось войти. Проверьте номер и пароль."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login_page">
      <form className="login_card" onSubmit={handleSubmit}>
        <div className="login_logo">
          <img src="/logo.png" alt="Пекарня хаидар" />
        </div>

        <h1>Пекарня хаидар</h1>
        <p className="login_subtitle">Вход в систему учёта пекарни</p>

        <label className="field">
          <span className="field_label">Номер телефона</span>
          <input
            type="tel"
            placeholder="+996 XXX XXX XXX"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field_label">Пароль</span>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && <div className="login_error">{error}</div>}

        <button type="submit" className="login_submit" disabled={!isValid || submitting}>
          {submitting ? "Вход…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
