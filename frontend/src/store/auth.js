import { create } from 'zustand';
import { api, refreshKey, tokenKey } from '../lib/api';
import { currentTenantSlug } from '../lib/tenant';

export const useAuth = create((set) => ({
  user: null,
  loading: true,
  async bootstrap() {
    const token = localStorage.getItem(tokenKey(currentTenantSlug()));
    if (!token) return set({ user: null, loading: false });
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data, loading: false });
    } catch {
      localStorage.removeItem(tokenKey(currentTenantSlug()));
      set({ user: null, loading: false });
    }
  },
  async login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    // Scoped per restaurant, so signing into one admin never signs you into
    // another — which is exactly what a real tenant boundary must do.
    const slug = currentTenantSlug();
    localStorage.setItem(tokenKey(slug), data.token);
    localStorage.setItem(refreshKey(slug), data.refreshToken);
    set({ user: data.user, loading: false });
    return data.user;
  },
  logout() {
    const slug = currentTenantSlug();
    localStorage.removeItem(tokenKey(slug));
    localStorage.removeItem(refreshKey(slug));
    set({ user: null, loading: false });
  },
}));
