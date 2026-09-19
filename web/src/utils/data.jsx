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

  // Лого/название организации — сохраняются при логине (см. Login.jsx) и
  // читаются шапкой (Navigation.jsx) прямо из localStorage, без отдельного
  // запроса /auth/me/ на каждый рендер.
  const get_organization = () => {
    try {
      const raw = localStorage.getItem("organization");
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error("Error parsing organization from localStorage:", error);
      return null;
    }
  };

  const setOrganization = (organization) => {
    try {
      localStorage.setItem("organization", JSON.stringify(organization));
      return organization;
    } catch (error) {
      console.error("Error setting organization to localStorage:", error);
      return null;
    }
  };

  // Владелец организации (не django-admin) — только он может оформить заказ
  // сверх дневного лимита товара и задавать особые лимиты на дату. Сохраняется
  // при логине рядом с organization (см. Login.jsx), тем же способом.
  const get_is_owner = () => {
    try {
      return localStorage.getItem("isOwner") === "true";
    } catch (error) {
      console.error("Error reading isOwner from localStorage:", error);
      return false;
    }
  };

  const setIsOwner = (isOwner) => {
    try {
      localStorage.setItem("isOwner", isOwner ? "true" : "false");
      return isOwner;
    } catch (error) {
      console.error("Error setting isOwner to localStorage:", error);
      return null;
    }
  };

  // get in .env
  const apiUrl = import.meta.env.VITE_API;

  return {
    url: apiUrl,
    token: get_user_token(),
    setToken,
    organization: get_organization(),
    setOrganization,
    isOwner: get_is_owner(),
    setIsOwner,
  };
};


export default Config