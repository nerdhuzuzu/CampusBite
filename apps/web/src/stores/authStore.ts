import { create } from 'zustand';
import api from '@/lib/axios';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string, role: 'STUDENT' | 'MANAGER' | 'SUPER_ADMIN') => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  clearError: () => void;
}

const roleLoginEndpoints: Record<string, string> = {
  STUDENT: '/auth/student/login',
  MANAGER: '/auth/manager/login',
  SUPER_ADMIN: '/auth/admin/login',
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (email: string, password: string, role: 'STUDENT' | 'MANAGER' | 'SUPER_ADMIN') => {
    set({ isLoading: true, error: null });
    try {
      const endpoint = roleLoginEndpoints[role];
      const response = await api.post(endpoint, { email, password });
      const user = response.data.data?.user || response.data.user || response.data.data;
      set({ user, isAuthenticated: true, isLoading: false, error: null });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err.response?.data?.message || 'Login failed. Please try again.';
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Logout even if API call fails
    } finally {
      set({ user: null, isAuthenticated: false, isLoading: false, error: null });
    }
  },

  fetchUser: async () => {
    set({ isLoading: true });
    try {
      const response = await api.get('/auth/me');
      const user = response.data.data?.user || response.data.user || response.data.data;
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
