import axios from "axios";
import Config from "./../data.jsx";

const { url } = Config();

const api = axios.create({
  baseURL: `${url}`,
});

// Добавляем перехватчик ответа
api.interceptors.response.use(
  (response) => response, // Если ответ успешный, просто возвращаем его
  (error) => {
    if (error.response && error.response.status === 401) {
      // Удаляем токен из localStorage
      localStorage.removeItem("userToken");

      // Перенаправляем на страницу логина
      window.location.href = "/login";
    }
    return Promise.reject(error); // Передаем ошибку дальше
  }
);

export default api;