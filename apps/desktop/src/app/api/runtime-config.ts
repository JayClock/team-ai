export const desktopRuntimeChannel = 'desktop:get-runtime-config';

export interface DesktopRuntimeConfig {
  apiBaseUrl: string;
  appVersion: string;
  platform: NodeJS.Platform;
}
