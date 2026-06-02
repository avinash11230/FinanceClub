import axios from 'axios';

// Same-origin in dev thanks to the Vite proxy; cookies travel automatically.
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Normalise error messages so components can show err.message directly,
// while keeping the response body + status available as err.data / err.status.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const data = err.response?.data;
    const msg = data?.error || err.message || 'Something went wrong.';
    const e = new Error(msg);
    e.data = data;
    e.status = err.response?.status;
    return Promise.reject(e);
  }
);

export default api;
