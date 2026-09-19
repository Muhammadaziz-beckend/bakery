// Обёртки над Get/Post/Patch (src/utils/routes/) для публичного API витрины
// (apps/storefront на бэкенде, смонтирован под /public/ — см. api/v1/urls.py).
import Get from "../utils/routes/get";
import Post from "../utils/routes/post";
import Patch from "../utils/routes/patch";
import { buildQuery } from "../utils/apiHelpers";

export const register = (data) => Post("public/auth/register/", data);

export const login = (data) => Post("public/auth/login/", data);

export const getMe = (token) => Get("public/auth/me/", token);

export const updateMe = (data, token) => Patch("public/auth/me/", data, token);

export const getOrganizations = () => Get("public/organizations/");

// Определяет организацию по домену/поддомену браузера (ali.maximumcomfort.pro
// -> организация со slug="ali") — см. PublicOrganizationResolveView на бэкенде.
export const resolveOrganizationByHost = (host) =>
  Get(`public/organizations/resolve/${buildQuery({ host })}`);

export const getOrganization = (orgId) => Get(`public/organizations/${orgId}/`);

export const getCategories = (orgId) =>
  Get(`public/organizations/${orgId}/categories/`);

export const getProducts = (orgId, params = {}) =>
  Get(`public/organizations/${orgId}/products/${buildQuery(params)}`);

export const getProduct = (orgId, productId) =>
  Get(`public/organizations/${orgId}/products/${productId}/`);

export const getOrders = (token, params = {}) =>
  Get(`public/orders/${buildQuery(params)}`, token);

export const getOrder = (orderId, token) => Get(`public/orders/${orderId}/`, token);

export const createOrder = (data, token) => Post("public/orders/", data, token);
