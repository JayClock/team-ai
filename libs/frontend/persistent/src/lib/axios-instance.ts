import axios from 'axios';

export const axiosInstance = axios.create({
  baseURL: '',
  timeout: 5000,
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.data.status === 'unauthorized') {
      window.location.href = error.response.data._links.github_login.href;
    }
  }
);
