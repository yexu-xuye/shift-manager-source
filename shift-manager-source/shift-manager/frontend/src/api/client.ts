import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 10000 });

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.error || err.response?.data?.detail || err.message;
    console.error('API Error:', msg);
    return Promise.reject(err);
  }
);

export default api;
