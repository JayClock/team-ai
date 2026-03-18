import { describe, expect, it, vi } from 'vitest';
import { AcpSessionProcessManager } from './acp-session-process-manager';

describe('AcpSessionProcessManager', () => {
  it('tracks active sessions and exposes process-oriented snapshots', async () => {
    const manager = new AcpSessionProcessManager<{ value: string }>();

    await manager.register({
      cleanup: vi.fn(async () => undefined),
      cwd: '/tmp/project',
      localSessionId: 'local-1',
      provider: 'codex',
      resource: { value: 'active' },
      runtimeSessionId: 'runtime-1',
    });

    expect(manager.has('local-1')).toBe(true);
    expect(manager.get('local-1')?.resource).toEqual({ value: 'active' });
    expect(manager.list()).toEqual([
      {
        cwd: '/tmp/project',
        localSessionId: 'local-1',
        provider: 'codex',
        runtimeSessionId: 'runtime-1',
      },
    ]);
  });

  it('cleans up replaced and removed sessions', async () => {
    const manager = new AcpSessionProcessManager<{ value: string }>();
    const firstCleanup = vi.fn(async () => undefined);
    const secondCleanup = vi.fn(async () => undefined);

    await manager.register({
      cleanup: firstCleanup,
      cwd: '/tmp/project-a',
      localSessionId: 'local-1',
      provider: 'codex',
      resource: { value: 'first' },
      runtimeSessionId: 'runtime-1',
    });

    await manager.register({
      cleanup: secondCleanup,
      cwd: '/tmp/project-b',
      localSessionId: 'local-1',
      provider: 'opencode',
      resource: { value: 'second' },
      runtimeSessionId: 'runtime-2',
    });

    expect(firstCleanup).toHaveBeenCalledTimes(1);
    expect(manager.list()).toEqual([
      {
        cwd: '/tmp/project-b',
        localSessionId: 'local-1',
        provider: 'opencode',
        runtimeSessionId: 'runtime-2',
      },
    ]);

    await manager.remove('local-1');

    expect(secondCleanup).toHaveBeenCalledTimes(1);
    expect(manager.list()).toEqual([]);
  });

  it('closes all tracked sessions', async () => {
    const manager = new AcpSessionProcessManager<{ value: string }>();
    const firstCleanup = vi.fn(async () => undefined);
    const secondCleanup = vi.fn(async () => undefined);

    await manager.register({
      cleanup: firstCleanup,
      cwd: '/tmp/project-a',
      localSessionId: 'local-1',
      provider: 'codex',
      resource: { value: 'first' },
      runtimeSessionId: 'runtime-1',
    });
    await manager.register({
      cleanup: secondCleanup,
      cwd: '/tmp/project-b',
      localSessionId: 'local-2',
      provider: 'opencode',
      resource: { value: 'second' },
      runtimeSessionId: 'runtime-2',
    });

    await manager.close();

    expect(firstCleanup).toHaveBeenCalledTimes(1);
    expect(secondCleanup).toHaveBeenCalledTimes(1);
    expect(manager.list()).toEqual([]);
  });
});
