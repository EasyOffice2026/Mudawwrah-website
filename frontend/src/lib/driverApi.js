import axios from 'axios';
import { API_BASE } from './api';
import { currentTenantSlug, storageKey } from './tenant';

/**
 * The driver page's own connection to the server.
 *
 * Kept apart from the admin's (lib/api.js) on purpose: a driver's sign-in is stored under its own name, so it never
 * mixes with an owner or branch signed in on the same phone, and it renews itself. A driver's token lasts a day and
 * its renewal token thirty; each renewal hands back a new thirty-day one, so a phone used every week is never asked
 * for the password again, while one that is lost stops working the moment the owner signs the driver out.
 */
const tokenKey = (slug = currentTenantSlug()) => storageKey('driver_token', slug);
const refreshKey = (slug = currentTenantSlug()) => storageKey('driver_refresh', slug);
const userKey = (slug = currentTenantSlug()) => storageKey('driver_user', slug);

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const driverToken = () => read(tokenKey());
export const savedDriver = () => {
  try {
    return JSON.parse(read(userKey()) || 'null');
  } catch {
    return null;
  }
};

const keep = ({ token, refreshToken, user }) => {
  if (token) localStorage.setItem(tokenKey(), token);
  if (refreshToken) localStorage.setItem(refreshKey(), refreshToken);
  if (user) localStorage.setItem(userKey(), JSON.stringify({ id: user.id, name: user.name }));
};

export const signOutDriver = () => {
  for (const key of [tokenKey(), refreshKey(), userKey()]) localStorage.removeItem(key);
};

const headers = () => {
  const slug = currentTenantSlug();
  return {
    'ngrok-skip-browser-warning': 'true',
    'X-Storefront-Host': window.location.hostname,
    ...(slug ? { 'X-Tenant': slug } : {}),
  };
};

/** What the Android app needs to report the phone's position by itself: where to send it, and as whom. */
export const trackingTarget = () => ({ url: `${API_BASE}/driver/location`, token: driverToken(), tenant: currentTenantSlug() });

// One renewal at a time, however many requests found the token expired together.
let renewing = null;
export const renewDriverSession = () => {
  if (renewing) return renewing;
  const refreshToken = read(refreshKey());
  if (!refreshToken) return Promise.reject(new Error('signed out'));
  renewing = axios
    .post(`${API_BASE}/auth/refresh`, { refreshToken }, { headers: headers() })
    .then(({ data }) => {
      keep(data);
      return data.token;
    })
    .finally(() => {
      renewing = null;
    });
  return renewing;
};

export const driverApi = axios.create({ baseURL: API_BASE });

driverApi.interceptors.request.use((config) => {
  Object.assign(config.headers, headers());
  const token = driverToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

driverApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    // An expired token is renewed once and the request repeated; if that fails too the driver signs in again.
    if (error.response?.status !== 401 || original?.renewed || original?.url?.includes('/driver/login')) throw error;
    try {
      await renewDriverSession();
    } catch {
      signOutDriver();
      throw error;
    }
    return driverApi({ ...original, renewed: true });
  },
);

export const signInDriver = async (phone, password) => {
  const { data } = await driverApi.post('/driver/login', { phone, password });
  keep(data);
  return data.user;
};
