export const desktopSessionHeader = 'X-Desktop-Session';
export const desktopRuntimeChannel = 'desktop:get-runtime-config';

export interface DesktopRuntimeConfig {
  apiBaseUrl: string;
  appVersion: string;
  desktopSessionHeader: string;
  desktopSessionToken: string;
  platform: NodeJS.Platform;
}
