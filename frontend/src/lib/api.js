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

/**
 * This browser's approval as a branch device (Users → Branch devices), if the owner gave it one: { key, id,
 * branchId, name }. The key goes with every request; a branch with approved devices accepts its branch accounts
 * from those devices only.
 */
export const deviceKey = (slug) => storageKey('device', slug);
export const readDevice = (slug = currentTenantSlug()) => {
  try {
    return JSON.parse(localStorage.getItem(deviceKey(slug)) || 'null');
  } catch {
    return null;
  }
};

api.interceptors.request.use((config) => {
  const slug = currentTenantSlug();
  // Tells the API which restaurant this request belongs to. The API also
  // accepts a custom domain or subdomain, which is the production path.
  if (slug) config.headers['X-Tenant'] = slug;
  // The page and the API are on different hosts — the frontend calls the API
  // directly cross-origin (ngrok today, likely Render later), so the raw
  // Host header the API sees on that request is the API's own host, never
  // the storefront's. Sending the address bar's actual hostname explicitly
  // is what lets a restaurant's own domain resolve at all; without it,
  // resolveTenant's custom-domain matching would have nothing real to
  // compare against.
  config.headers['X-Storefront-Host'] = window.location.hostname;
  const token = localStorage.getItem(tokenKey(slug));
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const device = readDevice(slug);
  if (device?.key) config.headers['X-Device-Key'] = device.key;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const { pathname } = window.location;
    if (error.response?.status === 401 && !pathname.endsWith('/admin/login')) {
      localStorage.removeItem(tokenKey(currentTenantSlug()));
      // An expired session must not leave the dashboard on screen: the order
      // desk would keep showing old orders, silently, with no chime. Send it
      // to the login page instead so staff see they have to sign in again.
      if (/\/admin(\/|$)/.test(pathname)) window.location.assign(pathname.replace(/\/admin(\/.*)?$/, '/admin/login'));
    }
    return Promise.reject(error);
  },
);

// A server failure carries a short reference (ref) that finds it in the server log: shown with the message so a
// screenshot of the error is enough to trace it.
export const apiError = (error) => {
  const data = error?.response?.data;
  const message = data?.details?.[0]?.message || data?.error || error?.message || 'Unexpected error';
  return data?.ref ? `${message} (ref ${data.ref})` : message;
};
