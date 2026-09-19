import { useEffect, useState } from "react";
import { getMe, updateMe } from "../api/storefront";
import { errorMessage, isApiError } from "../utils/apiHelpers";
import Config from "../utils/data.jsx";

export function Profile() {
  const { token, customer, setCustomer } = Config();

  const [name, setName] = useState(customer?.name ?? "");
  const [lastName, setLastName] = useState(customer?.last_name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getMe(token);
      if (cancelled) return;
      if (!isApiError(res)) {
        setName(res.data.name ?? "");
        setLastName(res.data.last_name ?? "");
        setPhone(res.data.phone ?? "");
        setCustomer(res.data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSaved(false);

    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("last_name", lastName.trim());

    const res = await updateMe(formData, token);
    if (isApiError(res)) {
      setError(errorMessage(res, "Не удалось сохранить профиль."));
    } else {
      setCustomer(res.data);
      setSaved(true);
    }
    setSubmitting(false);
  };

  if (loading) return <div className="page-wrap"><p className="table__hint">Загрузка…</p></div>;

  return (
    <div className="page-wrap">
      <div className="page-header">
        <h1>Профиль</h1>
      </div>

      <form className="card auth-card" onSubmit={handleSubmit}>
        <label className="field">
          <span>Номер телефона</span>
          <input type="tel" value={phone} disabled />
        </label>

        <label className="field">
          <span>Имя</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="field">
          <span>Фамилия</span>
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </label>

        {error && <div className="alert alert-error">{error}</div>}
        {saved && <div className="alert alert-success">Сохранено</div>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Сохраняем…" : "Сохранить"}
        </button>
      </form>
    </div>
  );
}
