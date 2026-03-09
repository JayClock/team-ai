import { beforeEach, describe, expect, it } from 'vitest';
import {
  getCurrentApiBaseUrl,
  getCurrentDesktopRuntimeConfig,
  getRootResource,
  initializeApiClient,
} from './api-client.js';

type TestDesktopRuntimeConfig = {
  apiBaseUrl: string;
  desktopSessionHeader: string;
  desktopSessionToken: string;
};

type TestRuntimeWindow = typeof globalThis & {
  teamai?: {
    getRuntimeConfig?: () => Promise<TestDesktopRuntimeConfig>;
  };
  window: TestRuntimeWindow;
};

const runtimeWindow = globalThis as TestRuntimeWindow;

describe('api-client desktop runtime config', () => {
  beforeEach(() => {
    runtimeWindow.window = runtimeWindow;
    delete runtimeWindow.teamai;
  });

  it('falls back to the web dev server without desktop runtime config', async () => {
    await initializeApiClient();

    expect(getCurrentDesktopRuntimeConfig()).toBeNull();
    expect(getCurrentApiBaseUrl()).toBe('http://localhost:4200');
    expect(getRootResource().uri).toBe('http://localhost:4200/api');
  });

  it('switches root resource to the desktop local server when runtime config exists', async () => {
    runtimeWindow.teamai = {
      getRuntimeConfig: async () => ({
        apiBaseUrl: 'http://127.0.0.1:43123/api',
        desktopSessionHeader: 'X-Desktop-Session',
        desktopSessionToken: 'desktop-token',
      }),
    };

    await initializeApiClient();

    expect(getCurrentApiBaseUrl()).toBe('http://127.0.0.1:43123/api');
    expect(getCurrentDesktopRuntimeConfig()).toMatchObject({
      apiBaseUrl: 'http://127.0.0.1:43123/api',
      desktopSessionHeader: 'X-Desktop-Session',
      desktopSessionToken: 'desktop-token',
    });
    expect(getRootResource().uri).toBe('http://127.0.0.1:43123/api');
  });
});
