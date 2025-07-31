import axios from 'axios';

export const api = axios.create({
  baseURL: '/api/',
  timeout: 5000,
});

api.interceptors.request.use(config => {
  config.headers['Accept'] = 'application/hal+json';
  return config;
});
