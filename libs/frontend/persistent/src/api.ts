import axios from 'axios';

export const api = axios.create({
  baseURL: '/api/',
  timeout: 5000,
});

api.interceptors.request.use((config) => {
  config.headers['Accept'] = 'application/hal+json';
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.data.status === 'unauthorized') {
      window.location.href = error.response.data._links.github_login.href;
    }
  }
);
