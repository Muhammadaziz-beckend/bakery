import api from "./api.js";

const Patch = async (url, data, token = null) => {

    const config = {
        headers: {
            'Authorization': token ? `Token ${token}` : "",
            'Content-Type': 'multipart/form-data'
        }
    }

    try {
        const res = await api.patch(url, data, token ? config : '')

        console.log(res);
        
        return res
    } catch (error) {
        console.log(error);
        return error
    }
}

export default Patch;