import { beforeEach, describe, expect, it, vi } from 'vitest';

const agentGatewayStartMock = vi.fn();
const agentGatewayStopMock = vi.fn();
const localServerStartMock = vi.fn();
const localServerStopMock = vi.fn();

vi.mock('./agent-gateway', () => ({
  AgentGatewayManager: {
    start: agentGatewayStartMock,
    stop: agentGatewayStopMock,
  },
}));

vi.mock('./local-server', () => ({
  LocalServerManager: {
    start: localServerStartMock,
    stop: localServerStopMock,
    getRuntimeConfig: vi.fn(() => ({
      apiBaseUrl: 'http://127.0.0.1:4310/api',
      appVersion: '1.2.3',
      desktopSessionHeader: 'X-Desktop-Session',
      desktopSessionToken: 'desktop-token-123',
      platform: process.platform,
    })),
  },
}));

vi.mock('../environments/environment', () => ({
  environment: {
    production: false,
    version: 'test-build',
  },
}));

const ipcHandleMock = vi.fn();
const browserWindowLoadUrlMock = vi.fn();
const browserWindowSetMenuMock = vi.fn();
const browserWindowCenterMock = vi.fn();
const browserWindowShowMock = vi.fn();

class BrowserWindowMock {
  loadURL = browserWindowLoadUrlMock;
  setMenu = browserWindowSetMenuMock;
  center = browserWindowCenterMock;
  show = browserWindowShowMock;
  once = vi.fn((event: string, handler: () => void) => {
    if (event === 'ready-to-show') {
      handler();
    }
  });
  on = vi.fn();
}

vi.mock('electron', () => ({
  BrowserWindow: BrowserWindowMock,
  ipcMain: {
    handle: ipcHandleMock,
  },
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      workAreaSize: {
        width: 1280,
        height: 720,
      },
    })),
  },
}));

describe('desktop App bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    agentGatewayStartMock.mockResolvedValue({
      baseUrl: 'http://127.0.0.1:3321',
      host: '127.0.0.1',
      port: 3321,
    });
    localServerStartMock.mockResolvedValue({
      apiBaseUrl: 'http://127.0.0.1:4310/api',
    });
    agentGatewayStopMock.mockResolvedValue(undefined);
    localServerStopMock.mockResolvedValue(undefined);
  });

  it('starts gateway before local-server and stops both on quit', async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const fakeElectronApp = {
      isPackaged: false,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        listeners.set(event, handler);
      }),
      quit: vi.fn(),
    };

    const { default: App } = await import('./app');

    App.main(fakeElectronApp as never, {} as never);
    await listeners.get('ready')?.();

    expect(agentGatewayStartMock).toHaveBeenCalledBefore(localServerStartMock);
    expect(localServerStartMock).toHaveBeenCalledWith(fakeElectronApp, {
      agentGatewayBaseUrl: 'http://127.0.0.1:3321',
    });

    await listeners.get('before-quit')?.();

    expect(localServerStopMock).toHaveBeenCalledTimes(1);
    expect(agentGatewayStopMock).toHaveBeenCalledTimes(1);
  });
});
