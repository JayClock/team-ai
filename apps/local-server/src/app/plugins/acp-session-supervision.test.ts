import Fastify from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fp from 'fastify-plugin';
import {
  acpStreamPlugin,
  type AcpRuntimeClient,
} from '@orchestration/runtime-acp';
import sqlitePlugin from './sqlite';
import acpSessionSupervisionPlugin from './acp-session-supervision';

describe('acp session supervision plugin', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];
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

    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('starts on ready and stops on close when enabled', async () => {
    await createStandaloneDatabase(cleanupTasks);
    const fastify = Fastify({ logger: false });
    fastifyInstances.push(fastify);

    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(
      fp(
        async (instance) => {
          instance.decorate('acpRuntime', createRuntimeStub());
        },
        { name: 'acp-runtime' },
      ),
    );
    await fastify.register(acpSessionSupervisionPlugin, {
      intervalMs: 1_000,
    });
    await fastify.ready();

    expect(fastify.acpSessionSupervisionService.isRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(fastify.acpSessionSupervisionService.isRunning()).toBe(true);

    fastifyInstances.pop();
    await fastify.close();
    expect(fastify.acpSessionSupervisionService.isRunning()).toBe(false);
  });

  it('stays stopped when explicitly disabled', async () => {
    await createStandaloneDatabase(cleanupTasks);
    const fastify = Fastify({ logger: false });
    fastifyInstances.push(fastify);

    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(
      fp(
        async (instance) => {
          instance.decorate('acpRuntime', createRuntimeStub());
        },
        { name: 'acp-runtime' },
      ),
    );
    await fastify.register(acpSessionSupervisionPlugin, {
      enabled: false,
      intervalMs: 1_000,
    });
    await fastify.ready();

    expect(fastify.acpSessionSupervisionService.isRunning()).toBe(false);
  });
});

async function createStandaloneDatabase(cleanupTasks: Array<() => Promise<void>>) {
  const dataDir = await mkdtemp(
    join(tmpdir(), 'team-ai-acp-session-supervision-plugin-'),
  );
  const previousDataDir = process.env.TEAMAI_DATA_DIR;

  process.env.TEAMAI_DATA_DIR = dataDir;
  cleanupTasks.push(async () => {
    if (previousDataDir === undefined) {
      delete process.env.TEAMAI_DATA_DIR;
    } else {
      process.env.TEAMAI_DATA_DIR = previousDataDir;
    }
    await rm(dataDir, { recursive: true, force: true });
  });
}

function createRuntimeStub(): AcpRuntimeClient {
  return {
    cancelSession: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createSession: vi.fn(async (input) => ({
      cwd: input.cwd,
      isBusy: false,
      lastTouchedAt: new Date().toISOString(),
      localSessionId: input.localSessionId,
      provider: input.provider,
      runtimeSessionId: 'runtime-1',
    })),
    isConfigured: vi.fn(() => true),
    isSessionActive: vi.fn(() => true),
    killSession: vi.fn(async () => undefined),
    listSessions: vi.fn(() => []),
    loadSession: vi.fn(async (input) => ({
      cwd: input.cwd,
      isBusy: false,
      lastTouchedAt: new Date().toISOString(),
      localSessionId: input.localSessionId,
      provider: input.provider,
      runtimeSessionId: input.runtimeSessionId,
    })),
    promptSession: vi.fn(async () => ({
      response: {
        stopReason: 'end_turn' as const,
      },
      runtimeSessionId: 'runtime-1',
    })),
  };
}
