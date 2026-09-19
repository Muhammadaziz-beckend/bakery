const Config = () => {
    const user = localStorage.getItem("userToken");

  const get_user_token = () => {
    if (typeof user === "string") {
      try {
        // Try parsing the token, if it's valid JSON
        const parsedUser = JSON.parse(user);
        return parsedUser?.info?.token; // Return the token if it exists
      } catch (error) {
        console.error("Error parsing user token from localStorage:", error);
        return null; // Return null if the JSON is invalid
      }
    }

    return user?.info?.token; // If it's not a string, return token property directly
  };

  const setToken = (token) => {
    try {
      // Save the token as a JSON string to localStorage
      localStorage.setItem("userToken", JSON.stringify({ info: token }));
      return token; // Return the token
    } catch (error) {
      console.error("Error setting token to localStorage:", error);
      return null; // Return null if there was an error
    }
  };

  // Профиль покупателя (имя/фамилия/телефон) — сохраняется при входе/регистрации
  // рядом с токеном, чтобы шапка сайта могла показать "Здравствуйте, Имя" без
  // отдельного запроса на каждый рендер (тот же приём, что и "organization" в
  // админке, см. bakery/web/src/utils/data.jsx).
  const get_customer = () => {
    try {
      const raw = localStorage.getItem("customer");
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error("Error parsing customer from localStorage:", error);
      return null;
    }
  };

  const setCustomer = (customer) => {
    try {
      localStorage.setItem("customer", JSON.stringify(customer));
      return customer;
    } catch (error) {
      console.error("Error setting customer to localStorage:", error);
      return null;
    }
  };

  const logout = () => {
    localStorage.removeItem("userToken");
    localStorage.removeItem("customer");
  };

  // get in .env
  const apiUrl = import.meta.env.VITE_API;

  return {
    url: apiUrl,
    token: get_user_token(),
    setToken,
    customer: get_customer(),
    setCustomer,
    logout,
  };
};


export default Config