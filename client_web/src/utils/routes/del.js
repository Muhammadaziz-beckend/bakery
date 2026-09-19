import api from "./api.js";

const Del = async (url, token = null) => {
  const config = {
    headers: {
      Authorization: `Token ${token}`,
    },
  };

  try {
    const res = await api.delete(url, token ? config : "");
    return res;
  } catch (error) {
    console.log(error);
    return error;
  }
};

export default Del;
