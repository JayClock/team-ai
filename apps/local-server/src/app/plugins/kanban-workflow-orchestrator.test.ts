import Fastify from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import backgroundWorkerPlugin from './background-worker';
import kanbanWorkflowOrchestratorPlugin from './kanban-workflow-orchestrator';
import sqlitePlugin from './sqlite';
import acpStreamPlugin from './acp-stream';
import fp from 'fastify-plugin';
import type { AcpRuntimeClient } from '../clients/acp-runtime-client';

describe('kanban workflow orchestrator plugin', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
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

  it('starts on ready and exposes the orchestrator instance', async () => {
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
    await fastify.register(backgroundWorkerPlugin, {
      enabled: false,
    });
    await fastify.register(kanbanWorkflowOrchestratorPlugin);
    await fastify.ready();

    expect(fastify.kanbanWorkflowOrchestrator.getActiveAutomations()).toEqual(
      [],
    );
  });
});

function createRuntimeStub(): AcpRuntimeClient {
  return {
    cancelSession: async () => undefined,
    close: async () => undefined,
    createSession: async (input) => ({
      provider: input.provider,
      runtimeSessionId: 'runtime-kanban-test',
    }),
    killSession: async () => undefined,
    isConfigured: () => false,
    isSessionActive: () => false,
    loadSession: async (input) => ({
      provider: input.provider,
      runtimeSessionId: input.runtimeSessionId,
    }),
    promptSession: async () => ({
      response: {
        stopReason: 'end_turn',
        usage: null,
        userMessageId: null,
      },
      runtimeSessionId: 'runtime-kanban-test',
    }),
  };
}

async function createStandaloneDatabase(
  cleanupTasks: Array<() => Promise<void>>,
) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-kanban-plugin-'));
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
