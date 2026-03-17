import Fastify from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createProject } from '../services/project-service';
import { createSchedule } from '../services/schedule-service';
import { createWorkflow } from '../services/workflow-service';
import sqlitePlugin from './sqlite';
import schedulerPlugin from './scheduler';

describe('scheduler plugin', () => {
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
    const { sqlite } = await createStandaloneDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-scheduler-plugin',
      title: 'Scheduler Plugin',
    });
    const workflow = await createWorkflow(sqlite, {
      name: 'Plugin workflow',
      projectId: project.id,
      steps: [
        {
          name: 'Implement',
          parallelGroup: null,
          prompt: 'Implement scheduled plugin work',
          specialistId: 'backend-crafter',
        },
      ],
    });
    await createSchedule(sqlite, {
      cronExpr: '* * * * *',
      name: 'Every minute',
      projectId: project.id,
      workflowId: workflow.id,
    });
    sqlite.close();

    const fastify = Fastify({ logger: false });
    fastifyInstances.push(fastify);

    await fastify.register(sqlitePlugin);
    await fastify.register(schedulerPlugin, {
      intervalMs: 1000,
    });
    await fastify.ready();

    expect(fastify.schedulerService.isRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);

    expect(fastify.schedulerService.isRunning()).toBe(true);

    fastifyInstances.pop();
    await fastify.close();
    expect(fastify.schedulerService.isRunning()).toBe(false);
  });

  it('stays stopped when explicitly disabled', async () => {
    await createStandaloneDatabase(cleanupTasks);
    const fastify = Fastify({ logger: false });
    fastifyInstances.push(fastify);

    await fastify.register(sqlitePlugin);
    await fastify.register(schedulerPlugin, {
      enabled: false,
      intervalMs: 1000,
    });
    await fastify.ready();

    expect(fastify.schedulerService.isRunning()).toBe(false);
  });
});

async function createStandaloneDatabase(cleanupTasks: Array<() => Promise<void>>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-scheduler-plugin-'));
  const previousDataDir = process.env.TEAMAI_DATA_DIR;

  process.env.TEAMAI_DATA_DIR = dataDir;
  const sqlite = initializeDatabase();

  cleanupTasks.push(async () => {
    try {
      sqlite.close();
    } catch {
      // ignore duplicate close during tests
    }
    if (previousDataDir === undefined) {
      delete process.env.TEAMAI_DATA_DIR;
    } else {
      process.env.TEAMAI_DATA_DIR = previousDataDir;
    }
    await rm(dataDir, { recursive: true, force: true });
  });

  return { dataDir, sqlite };
}
