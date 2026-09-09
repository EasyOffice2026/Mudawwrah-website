import axios from 'axios';
import { currentTenantSlug, storageKey } from './tenant';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    // ngrok's free tier answers browser requests with an HTML interstitial
    // instead of the API response. This header opts out of it. Harmless on any
    // other host, so it is sent unconditionally rather than sniffing the URL.
    'ngrok-skip-browser-warning': 'true',
  },
});

export const tokenKey = (slug) => storageKey('token', slug);
export const refreshKey = (slug) => storageKey('refresh', slug);

api.interceptors.request.use((config) => {
  const slug = currentTenantSlug();
  // Tells the API which restaurant this request belongs to. The API also
  // accepts a custom domain or subdomain, which is the production path.
  if (slug) config.headers['X-Tenant'] = slug;
  const token = localStorage.getItem(tokenKey(slug));
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.endsWith('/admin/login')) {
      localStorage.removeItem(tokenKey(currentTenantSlug()));
    }
    return Promise.reject(error);
  },
);

export const apiError = (error) =>
  error?.response?.data?.details?.[0]?.message || error?.response?.data?.error || error.message || 'Unexpected error';
