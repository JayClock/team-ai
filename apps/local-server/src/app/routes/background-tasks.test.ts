import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import { createProject } from '../services/project-service';
import type { BackgroundWorkerHostService } from '../services/background-worker-host-service';
import { responseContentType } from '../test-support/response-content-type';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import backgroundTasksRoute from './background-tasks';

describe('background tasks route', () => {
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

  it('creates and lists background tasks for a project', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/Users/example/background-task-foundation',
      title: 'Background Task Foundation',
    });
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(backgroundTasksRoute, { prefix: '/api' });
    await fastify.ready();

    const createResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/background-tasks`,
      payload: {
        agentId: 'crafter',
        prompt: 'Implement the kanban foundation phase',
        title: 'Kanban Foundation Task',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(responseContentType(createResponse)).toBe(
      VENDOR_MEDIA_TYPES.backgroundTask,
    );
    expect(createResponse.json()).toMatchObject({
      agentId: 'crafter',
      projectId: project.id,
      status: 'PENDING',
      title: 'Kanban Foundation Task',
      triggerSource: 'manual',
    });

    const listResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/background-tasks`,
    });

    expect(listResponse.statusCode).toBe(200);
    expect(responseContentType(listResponse)).toBe(
      VENDOR_MEDIA_TYPES.backgroundTasks,
    );
    expect(listResponse.json()).toMatchObject({
      _embedded: {
        backgroundTasks: [
          {
            agentId: 'crafter',
            status: 'PENDING',
            title: 'Kanban Foundation Task',
          },
        ],
      },
      total: 1,
    });
  });

  it('returns a background task by id', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/Users/example/background-task-detail',
      title: 'Background Task Detail',
    });
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(backgroundTasksRoute, { prefix: '/api' });
    await fastify.ready();

    const createResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/background-tasks`,
      payload: {
        agentId: 'gate',
        prompt: 'Review the kanban foundation phase',
      },
    });
    const backgroundTaskId = (createResponse.json() as { id: string }).id;

    const detailResponse = await fastify.inject({
      method: 'GET',
      url: `/api/background-tasks/${backgroundTaskId}`,
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(responseContentType(detailResponse)).toBe(
      VENDOR_MEDIA_TYPES.backgroundTask,
    );
    expect(detailResponse.json()).toMatchObject({
      agentId: 'gate',
      id: backgroundTaskId,
      projectId: project.id,
      status: 'PENDING',
    });
  });

  it('manually triggers one background worker cycle', async () => {
    const sqlite = await createTestDatabase();
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);
    fastify.decorate('backgroundWorkerHostService', {
      isRunning: () => true,
      start: () => undefined,
      stop: () => undefined,
      tickNow: async () => ({
        completed: [
          {
            id: 'bgt_completed',
          },
        ],
        dispatched: [
          {
            id: 'bgt_dispatched',
          },
        ],
      }),
    } satisfies BackgroundWorkerHostService);

    await fastify.register(problemJsonPlugin);
    await fastify.register(backgroundTasksRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/background-tasks/process',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      completedCount: 1,
      completedTaskIds: ['bgt_completed'],
      dispatchedCount: 1,
      dispatchedTaskIds: ['bgt_dispatched'],
      running: true,
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-background-route-'));
    const previousDataDir = process.env.TEAMAI_DATA_DIR;

    process.env.TEAMAI_DATA_DIR = dataDir;
    const sqlite = initializeDatabase();

    cleanupTasks.push(async () => {
      sqlite.close();
      if (previousDataDir === undefined) {
        delete process.env.TEAMAI_DATA_DIR;
      } else {
        process.env.TEAMAI_DATA_DIR = previousDataDir;
      }
      await rm(dataDir, { recursive: true, force: true });
    });

    return sqlite;
  }
});
