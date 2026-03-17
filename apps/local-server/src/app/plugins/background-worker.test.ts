import Fastify from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fp from 'fastify-plugin';
import type { AcpRuntimeClient } from '../clients/acp-runtime-client';
import { initializeDatabase } from '../db/sqlite';
import sqlitePlugin from './sqlite';
import acpStreamPlugin from './acp-stream';
import backgroundWorkerPlugin from './background-worker';

describe('background worker plugin', () => {
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
      fp(async (instance) => {
        instance.decorate('acpRuntime', createRuntimeStub());
      }, { name: 'acp-runtime' }),
    );
    await fastify.register(backgroundWorkerPlugin, {
      intervalMs: 1000,
    });
    await fastify.ready();

    expect(fastify.backgroundWorkerHostService.isRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);

    expect(fastify.backgroundWorkerHostService.isRunning()).toBe(true);

    fastifyInstances.pop();
    await fastify.close();
    expect(fastify.backgroundWorkerHostService.isRunning()).toBe(false);
  });

  it('stays stopped when explicitly disabled', async () => {
    await createStandaloneDatabase(cleanupTasks);
    const fastify = Fastify({ logger: false });
    fastifyInstances.push(fastify);

    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(
      fp(async (instance) => {
        instance.decorate('acpRuntime', createRuntimeStub());
      }, { name: 'acp-runtime' }),
    );
    await fastify.register(backgroundWorkerPlugin, {
      enabled: false,
      intervalMs: 1000,
    });
    await fastify.ready();

    expect(fastify.backgroundWorkerHostService.isRunning()).toBe(false);
  });
});

function createRuntimeStub(): AcpRuntimeClient {
  return {
    cancelSession: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createSession: vi.fn(async (input) => ({
      provider: input.provider,
      runtimeSessionId: 'runtime-worker-test',
    })),
    deleteSession: vi.fn(async () => undefined),
    isConfigured: vi.fn(() => false),
    isSessionActive: vi.fn(() => false),
    loadSession: vi.fn(async (input) => ({
      provider: input.provider,
      runtimeSessionId: input.runtimeSessionId,
    })),
    promptSession: vi.fn(async () => ({
      response: {
        stopReason: 'end_turn',
        usage: null,
        userMessageId: null,
      },
      runtimeSessionId: 'runtime-worker-test',
    })),
  };
}

async function createStandaloneDatabase(
  cleanupTasks: Array<() => Promise<void>>,
) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-background-plugin-'));
  const previousDataDir = process.env.TEAMAI_DATA_DIR;

  process.env.TEAMAI_DATA_DIR = dataDir;
  const sqlite = initializeDatabase();
  sqlite.close();

  cleanupTasks.push(async () => {
    if (previousDataDir === undefined) {
      delete process.env.TEAMAI_DATA_DIR;
    } else {
      process.env.TEAMAI_DATA_DIR = previousDataDir;
    }
    await rm(dataDir, { recursive: true, force: true });
  });
}
