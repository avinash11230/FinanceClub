import axios from 'axios';

// Same-origin in dev thanks to the Vite proxy; cookies travel automatically.
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Normalise error messages so components can show err.message directly.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.error || err.message || 'Something went wrong.';
    return Promise.reject(new Error(msg));
  }
);

export default api;
