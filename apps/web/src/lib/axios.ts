import axios from 'axios';
import toast from 'react-hot-toast';

const baseURL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response) {
      const { status, data } = error.response;

      if (
        status === 401 &&
        originalRequest &&
        !originalRequest._retry &&
        !String(originalRequest.url).includes('/auth/login') &&
        !String(originalRequest.url).includes('/auth/student/login') &&
        !String(originalRequest.url).includes('/auth/manager/login') &&
        !String(originalRequest.url).includes('/auth/admin/login') &&
        !String(originalRequest.url).includes('/auth/refresh')
      ) {
        originalRequest._retry = true;
        if (!isRefreshing) {
          isRefreshing = true;
          try {
            await api.post('/auth/refresh');
            isRefreshing = false;
            return api(originalRequest);
          } catch {
            isRefreshing = false;
          }
        }
      }

      if (status === 403) {
        toast.error(data?.error || 'You do not have permission to perform this action.');
      }

      if (status >= 500) {
        toast.error(data?.error || data?.message || 'Server error. Please try again.');
      }
    } else if (error.request) {
      toast.error('Network error. Please check your connection.');
    }

    return Promise.reject(error);
  }
);

export default api;
