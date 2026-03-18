import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcpRuntimeClient } from '../clients/acp-runtime-client';
import acpStreamPlugin from './acp-stream';
import acpSessionReaperPlugin from './acp-session-reaper';

describe('acp-session-reaper plugin', () => {
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();

    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }
  });

  it('reaps idle sessions without subscribers', async () => {
    const killSession = vi.fn(async () => undefined);
    const fastify = Fastify({ logger: false });
    fastifyInstances.push(fastify);

    await fastify.register(acpStreamPlugin);
    await fastify.register(
      fp(async (instance) => {
        instance.decorate(
          'acpRuntime',
          createRuntimeStub({
            killSession,
            listSessions: () => [
              buildSnapshot({
                lastTouchedAt: '2026-03-18T00:00:00.000Z',
                localSessionId: 'session-stale',
              }),
            ],
          }),
        );
      }, { name: 'acp-runtime' }),
    );
    await fastify.register(acpSessionReaperPlugin, {
      idleTimeoutMs: 5_000,
      intervalMs: 1_000,
    });

    vi.setSystemTime(new Date('2026-03-18T00:00:10.000Z'));
    await fastify.ready();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(killSession).toHaveBeenCalledWith('session-stale');
  });

  it('keeps busy, subscribed, and recently touched sessions alive', async () => {
    const killSession = vi.fn(async () => undefined);
    const fastify = Fastify({ logger: false });
    fastifyInstances.push(fastify);

    await fastify.register(acpStreamPlugin);
    await fastify.register(
      fp(async (instance) => {
        instance.decorate(
          'acpRuntime',
          createRuntimeStub({
            killSession,
            listSessions: () => [
              buildSnapshot({
                isBusy: true,
                lastTouchedAt: '2026-03-18T00:00:00.000Z',
                localSessionId: 'session-busy',
              }),
              buildSnapshot({
                lastTouchedAt: '2026-03-18T00:00:08.000Z',
                localSessionId: 'session-recent',
              }),
              buildSnapshot({
                lastTouchedAt: '2026-03-18T00:00:00.000Z',
                localSessionId: 'session-streaming',
              }),
            ],
          }),
        );
      }, { name: 'acp-runtime' }),
    );
    await fastify.register(acpSessionReaperPlugin, {
      idleTimeoutMs: 5_000,
      intervalMs: 1_000,
    });

    vi.setSystemTime(new Date('2026-03-18T00:00:10.000Z'));
    await fastify.ready();
    const unsubscribe = fastify.acpStreamBroker.subscribe(
      'session-streaming',
      () => undefined,
    );

    await vi.advanceTimersByTimeAsync(1_000);

    expect(killSession).not.toHaveBeenCalled();

    unsubscribe();
  });
});

function buildSnapshot(
  overrides: Partial<ReturnType<NonNullable<AcpRuntimeClient['listSessions']>>[number]> = {},
) {
  return {
    cwd: '/tmp/project',
    isBusy: false,
    lastTouchedAt: '2026-03-18T00:00:00.000Z',
    localSessionId: 'session-1',
    provider: 'codex',
    runtimeSessionId: 'runtime-1',
    ...overrides,
  };
}

function createRuntimeStub(input: {
  killSession: AcpRuntimeClient['killSession'];
  listSessions: NonNullable<AcpRuntimeClient['listSessions']>;
}): AcpRuntimeClient {
  return {
    cancelSession: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createSession: vi.fn(),
    isConfigured: vi.fn(() => true),
    isSessionActive: vi.fn(() => false),
    killSession: input.killSession,
    listSessions: input.listSessions,
    loadSession: vi.fn(),
    promptSession: vi.fn(),
  } as unknown as AcpRuntimeClient;
}
