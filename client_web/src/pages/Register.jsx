import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api/storefront";
import { errorMessage, isApiError } from "../utils/apiHelpers";
import Config from "../utils/data.jsx";

export function Register() {
  const navigate = useNavigate();
  const { token, setToken, setCustomer } = Config();

  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (token) navigate("/", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const isValid = name.trim() && phone.trim() && password.length >= 6;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    setError("");

    const res = await register({
      name: name.trim(),
      last_name: lastName.trim(),
      phone: phone.trim(),
      password,
    });
    if (isApiError(res)) {
      setError(errorMessage(res, "Не удалось зарегистрироваться."));
      setSubmitting(false);
      return;
    }

    setToken(res.data);
    setCustomer(res.data.customer);
    navigate("/", { replace: true });
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Регистрация</h1>

        <label className="field">
          <span>Имя</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

        <label className="field">
          <span>Фамилия</span>
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </label>

        <label className="field">
          <span>Номер телефона</span>
          <input
            type="tel"
            placeholder="+996 XXX XXX XXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </label>

        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            placeholder="Минимум 6 символов"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>

        {error && <div className="alert alert-error">{error}</div>}

        <button type="submit" className="btn btn-primary btn-block" disabled={!isValid || submitting}>
          {submitting ? "Регистрация…" : "Зарегистрироваться"}
        </button>

        <p className="auth-switch">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </form>
    </div>
  );
}
