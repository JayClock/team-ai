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
      expect.objectContaining({
        cwd: '/tmp/project',
        isBusy: false,
        localSessionId: 'local-1',
        provider: 'codex',
        runtimeSessionId: 'runtime-1',
      }),
    ]);
    expect(Date.parse(manager.list()[0]!.lastTouchedAt)).not.toBeNaN();
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
      expect.objectContaining({
        cwd: '/tmp/project-b',
        isBusy: false,
        localSessionId: 'local-1',
        provider: 'opencode',
        runtimeSessionId: 'runtime-2',
      }),
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

  it('tracks session activity timestamps and busy state', async () => {
    const manager = new AcpSessionProcessManager<{ value: string }>();
    let releaseActivity: (() => void) | null = null;

    await manager.register({
      cleanup: vi.fn(async () => undefined),
      cwd: '/tmp/project-a',
      localSessionId: 'local-1',
      provider: 'codex',
      resource: { value: 'first' },
      runtimeSessionId: 'runtime-1',
    });

    const beforeTouch = manager.list()[0]!.lastTouchedAt;
    await Promise.resolve();
    manager.touch('local-1');
    const afterTouch = manager.list()[0]!.lastTouchedAt;

    const activity = manager.withActivity('local-1', async () => {
      releaseActivity = vi.fn();
      await new Promise<void>((resolve) => {
        releaseActivity = resolve;
      });
      return 'done';
    });

    expect(Date.parse(afterTouch)).toBeGreaterThanOrEqual(Date.parse(beforeTouch));
    expect(manager.list()[0]?.isBusy).toBe(true);

    releaseActivity?.();
    await activity;

    expect(manager.list()[0]?.isBusy).toBe(false);
  });
});
