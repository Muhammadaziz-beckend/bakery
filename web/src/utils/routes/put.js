import api from "./api.js";

const Put = async (url, data, token = null) => {

    const config = {
        headers: {
            'Authorization': token ? `Token ${token}` : "",
        }
    }

    try {
        const res = await api.put(url, data, token ? config : '')

        console.log(res);
        
        return res
    } catch (error) {
        console.log(error);
        return error
    }
}

export default Put;