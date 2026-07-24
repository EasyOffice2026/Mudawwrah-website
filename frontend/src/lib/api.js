import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mdawra_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/admin/login')) {
      localStorage.removeItem('mdawra_token');
    }
    return Promise.reject(error);
  },
);

export const apiError = (error) =>
  error?.response?.data?.details?.[0]?.message || error?.response?.data?.error || error.message || 'Unexpected error';
