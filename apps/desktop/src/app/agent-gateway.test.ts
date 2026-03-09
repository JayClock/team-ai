import { beforeEach, describe, expect, it, vi } from 'vitest';

const forkMock = vi.fn();
const findAvailablePortMock = vi.fn();
const resolveChildExecPathMock = vi.fn();
const resolveSidecarEntryMock = vi.fn();
const waitForHealthcheckMock = vi.fn();

vi.mock('node:child_process', () => ({
  fork: forkMock,
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

describe('AgentGatewayManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    findAvailablePortMock.mockResolvedValue(3321);
    resolveSidecarEntryMock.mockReturnValue('/tmp/agent-gateway/main.js');
    resolveChildExecPathMock.mockReturnValue('/usr/bin/node');
    waitForHealthcheckMock.mockResolvedValue(undefined);
  });

  it('starts the gateway sidecar and exposes runtime config', async () => {
    const child = createChildProcessMock();
    forkMock.mockReturnValue(child);

    const { AgentGatewayManager } = await import('./agent-gateway');

    const runtime = await AgentGatewayManager.start({
      isPackaged: false,
    } as never);

    expect(findAvailablePortMock).toHaveBeenCalledWith('127.0.0.1');
    expect(resolveSidecarEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      'agent-gateway',
      'apps/agent-gateway/dist',
    );
    expect(forkMock).toHaveBeenCalledWith('/tmp/agent-gateway/main.js', [], {
      execPath: '/usr/bin/node',
      env: expect.objectContaining({
        AGENT_GATEWAY_HOST: '127.0.0.1',
        AGENT_GATEWAY_PORT: '3321',
        ELECTRON_RUN_AS_NODE: '1',
      }),
      stdio: 'inherit',
    });
    expect(waitForHealthcheckMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3321/health',
    );
    expect(runtime).toEqual({
      baseUrl: 'http://127.0.0.1:3321',
      host: '127.0.0.1',
      port: 3321,
    });
    expect(AgentGatewayManager.getRuntime()).toEqual(runtime);
  });

  it('stops the gateway sidecar and clears cached runtime', async () => {
    const child = createChildProcessMock();
    forkMock.mockReturnValue(child);

    const { AgentGatewayManager } = await import('./agent-gateway');

    await AgentGatewayManager.start({
      isPackaged: false,
    } as never);
    await AgentGatewayManager.stop();

    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(AgentGatewayManager.getRuntime()).toBeNull();
  });
});
