export interface DesktopRuntimeConfig {
  apiBaseUrl: string;
  desktopSessionHeader: string;
  desktopSessionToken: string;
}

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

declare global {
  interface Window {
    teamai?: {
      getRuntimeConfig?: () => Promise<DesktopRuntimeConfig>;
    };
  }
}

export async function getDesktopRuntimeConfig(): Promise<DesktopRuntimeConfig | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const getRuntimeConfig = window.teamai?.getRuntimeConfig;

  if (!getRuntimeConfig) {
    return null;
  }

  return await getRuntimeConfig();
}
