import axios from 'axios';

export const axiosInstance = axios.create({
  baseURL: '/api/',
  timeout: 5000,
});

axiosInstance.interceptors.request.use((config) => {
  config.headers['Accept'] = 'application/hal+json';
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.data.status === 'unauthorized') {
      window.location.href = error.response.data._links.github_login.href;
    }
  }
);
