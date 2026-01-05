export const appConfig = {
  api: {
    baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4200',
    timeout: 30000,
  },
  auth: {
    loginPath: '/login',
    defaultUserId: '1',
  },
  routes: {
    root: '/',
    login: '/login',
  },
} as const;

export type AppConfig = typeof appConfig;
