// Get/Post/Put/Del ловят ошибку axios сами и возвращают её как обычное
// значение (не бросают исключение) — эти хелперы разбирают такой ответ.

export const isApiError = (res) => !res || !!res.isAxiosError || res instanceof Error;

// DRF отвечает ошибкой в трёх формах: строкой, списком строк
// (raise ValidationError("текст")) и словарём поле -> список сообщений.
const isPlainText = (val) =>
  typeof val === "string" || typeof val === "number" || typeof val === "boolean";

export const errorMessage = (res, fallback = "Произошла ошибка") => {
  if (!res) return fallback;
  const data = res?.response?.data;
  if (!data) return res.message || fallback;
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.filter(isPlainText).join(" ") || fallback;
  if (data.detail) return data.detail;

  const parts = Object.entries(data).flatMap(([key, val]) => {
    // структурированные данные (напр. shortages с нехваткой сырья) выводятся
    // отдельным блоком — сюда они попадать не должны, иначе будет [object Object]
    const items = (Array.isArray(val) ? val : [val]).filter(isPlainText);
    if (items.length === 0) return [];
    const text = items.join(" ");
    return [key === "non_field_errors" ? text : `${key}: ${text}`];
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
