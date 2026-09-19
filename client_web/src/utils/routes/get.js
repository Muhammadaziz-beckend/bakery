import api from "./api.js";

const Get = async (url, token = null) => {
  const config = {
    headers: {
      Authorization: `Token ${token}`, // Добавляем токен в заголовок
    },
  };
  try {
    const res = await api.get(url, token ? config : "");

    return res;
  } catch (e) {
    console.log("Ошибка при", e);
    return e
  }
};

export default Get;