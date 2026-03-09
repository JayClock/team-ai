import { beforeEach, describe, expect, it, vi } from 'vitest';

const existsSyncMock = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
}));

describe('node-sidecar', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('resolves packaged sidecar entries from process resources', async () => {
    existsSyncMock.mockImplementation((path: string) =>
      path === '/Applications/Team AI.app/Contents/Resources/agent-gateway/main.js',
    );
    vi.stubGlobal('process', {
      ...process,
      resourcesPath: '/Applications/Team AI.app/Contents/Resources',
    });

    const { resolveSidecarEntry } = await import('./node-sidecar');

    expect(
      resolveSidecarEntry(
        {
          isPackaged: true,
          getAppPath: vi.fn(() => '/tmp/app.asar'),
        } as never,
        'agent-gateway',
        'apps/agent-gateway/dist',
      ),
    ).toBe('/Applications/Team AI.app/Contents/Resources/agent-gateway/main.js');
  });

  it('returns undefined execPath in packaged mode', async () => {
    const { resolveChildExecPath } = await import('./node-sidecar');

    expect(
      resolveChildExecPath({
        isPackaged: true,
      } as never),
    ).toBeUndefined();
  });
});
