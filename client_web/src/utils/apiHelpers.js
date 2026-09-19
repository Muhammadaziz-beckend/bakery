// Get/Post/Put/Del ловят ошибку axios сами и возвращают её как обычное
// значение (не бросают исключение) — эти хелперы разбирают такой ответ.

export const isApiError = (res) => !res || !!res.isAxiosError || res instanceof Error;

export const errorMessage = (res, fallback = "Произошла ошибка") => {
  if (!res) return fallback;
  const data = res?.response?.data;
  if (!data) return res.message || fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  const parts = Object.entries(data).map(([key, val]) => {
    const text = Array.isArray(val) ? val.join(" ") : String(val);
    return key === "non_field_errors" ? text : `${key}: ${text}`;
  });
  return parts.join(" ") || fallback;
};

export const formatMoney = (value) => {
  const num = Number(value);
  if (Number.isNaN(num)) return value ?? "-";
  return num.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const buildQuery = (params = {}) => {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") usp.append(key, val);
  });
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
};
