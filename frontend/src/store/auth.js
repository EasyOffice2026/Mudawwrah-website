import { create } from 'zustand';
import { api } from '../lib/api';

export const useAuth = create((set) => ({
  user: null,
  loading: true,
  async bootstrap() {
    const token = localStorage.getItem('mdawra_token');
    if (!token) return set({ user: null, loading: false });
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data, loading: false });
    } catch {
      localStorage.removeItem('mdawra_token');
      set({ user: null, loading: false });
    }
  },
  async login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('mdawra_token', data.token);
    localStorage.setItem('mdawra_refresh', data.refreshToken);
    set({ user: data.user, loading: false });
    return data.user;
  },
  logout() {
    localStorage.removeItem('mdawra_token');
    localStorage.removeItem('mdawra_refresh');
    set({ user: null, loading: false });
  },
}));
