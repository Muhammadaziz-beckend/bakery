import api from "./api.js";

const Post = async (url, data, token = null) => {
  const config = {
    headers: {
      Authorization: `Token ${token}`, // Добавляем токен в заголовок
    },
  };

  try {
    const res = await api.post(url, data, token ? config : "");

    return res;
  } catch (error) {
    console.log(error);
    return error;
  }
};

export default Post;