import { beforeEach, describe, expect, it, vi } from 'vitest';

const forkMock = vi.fn();
const randomUuidMock = vi.fn();
const findAvailablePortMock = vi.fn();
const resolveChildExecPathMock = vi.fn();
const resolveSidecarEntryMock = vi.fn();
const waitForHealthcheckMock = vi.fn();

vi.mock('node:child_process', () => ({
  fork: forkMock,
}));

vi.mock('node:crypto', () => ({
  randomUUID: randomUuidMock,
}));

vi.mock('./node-sidecar', () => ({
  findAvailablePort: findAvailablePortMock,
  resolveChildExecPath: resolveChildExecPathMock,
  resolveSidecarEntry: resolveSidecarEntryMock,
  waitForHealthcheck: waitForHealthcheckMock,
}));

function createChildProcessMock() {
  let exitHandler: (() => void) | undefined;

  return {
    kill: vi.fn(() => {
      exitHandler?.();
      return true;
    }),
    once: vi.fn((event: string, handler: () => void) => {
      if (event === 'exit') {
        exitHandler = handler;
      }
      return undefined;
    }),
  };
}

describe('LocalServerManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    findAvailablePortMock.mockResolvedValue(4310);
    randomUuidMock.mockReturnValue('desktop-token-123');
    resolveSidecarEntryMock.mockReturnValue('/tmp/local-server/main.js');
    resolveChildExecPathMock.mockReturnValue('/usr/bin/node');
    waitForHealthcheckMock.mockResolvedValue(undefined);
  });

  it('starts local-server with injected gateway base url and desktop token', async () => {
    const child = createChildProcessMock();
    forkMock.mockReturnValue(child);

    const { LocalServerManager } = await import('./local-server');

    const runtime = await LocalServerManager.start(
      {
        getPath: vi.fn(() => '/tmp/team-ai-user-data'),
        getVersion: vi.fn(() => '1.2.3'),
        isPackaged: false,
      } as never,
      {
        agentGatewayBaseUrl: 'http://127.0.0.1:3321',
      },
    );

    expect(forkMock).toHaveBeenCalledWith('/tmp/local-server/main.js', [], {
      execPath: '/usr/bin/node',
      env: expect.objectContaining({
        AGENT_GATEWAY_BASE_URL: 'http://127.0.0.1:3321',
        DESKTOP_SESSION_TOKEN: 'desktop-token-123',
        HOST: '127.0.0.1',
        PORT: '4310',
        TEAMAI_DATA_DIR: '/tmp/team-ai-user-data/local-server',
      }),
      stdio: 'inherit',
    });
    expect(waitForHealthcheckMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4310/api/health',
      {
        'X-Desktop-Session': 'desktop-token-123',
      },
    );
    expect(runtime).toEqual({
      apiBaseUrl: 'http://127.0.0.1:4310/api',
      appVersion: '1.2.3',
      desktopSessionHeader: 'X-Desktop-Session',
      desktopSessionToken: 'desktop-token-123',
      platform: process.platform,
    });
  });

  it('stops local-server and clears runtime config', async () => {
    const child = createChildProcessMock();
    forkMock.mockReturnValue(child);

    const { LocalServerManager } = await import('./local-server');

    await LocalServerManager.start(
      {
        getPath: vi.fn(() => '/tmp/team-ai-user-data'),
        getVersion: vi.fn(() => '1.2.3'),
        isPackaged: false,
      } as never,
      {
        agentGatewayBaseUrl: 'http://127.0.0.1:3321',
      },
    );

    await LocalServerManager.stop();

    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(LocalServerManager.getRuntimeConfig()).toBeNull();
  });
});
