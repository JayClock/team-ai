import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import { createProject } from '../services/project-service';
import { createWorkflow } from '../services/workflow-service';
import { responseContentType } from '../test-support/response-content-type';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import schedulesRoute from './schedules';

describe('schedule routes', () => {
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

  it('creates, lists, and ticks schedules', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-schedule-routes',
      title: 'Schedule Routes',
    });
    const workflow = await createWorkflow(sqlite, {
      name: 'Scheduled workflow',
      projectId: project.id,
      steps: [
        {
          name: 'Implement',
          parallelGroup: null,
          prompt: 'Implement scheduled work',
          specialistId: 'backend-crafter',
        },
      ],
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      payload: {
        cronExpr: '* * * * *',
        name: 'Every minute',
        triggerPayloadTemplate: 'Schedule {scheduleName}',
        workflowId: workflow.id,
      },
      url: `/api/projects/${project.id}/schedules`,
    });

    expect(createResponse.statusCode).toBe(201);
    expect(responseContentType(createResponse)).toBe(VENDOR_MEDIA_TYPES.schedule);
    const schedule = createResponse.json() as { id: string };

    const listResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/schedules`,
    });

    expect(listResponse.statusCode).toBe(200);
    expect(responseContentType(listResponse)).toBe(VENDOR_MEDIA_TYPES.schedules);
    expect(listResponse.json()).toMatchObject({
      _embedded: {
        schedules: [expect.objectContaining({ id: schedule.id, workflowId: workflow.id })],
      },
    });

    sqlite
      .prepare(
        `
          UPDATE project_schedules
          SET next_run_at = ?
          WHERE id = ?
        `,
      )
      .run(new Date(Date.now() - 60_000).toISOString(), schedule.id);

    const tickResponse = await fastify.inject({
      method: 'POST',
      url: '/api/schedules/tick',
    });

    expect(tickResponse.statusCode).toBe(200);
    expect(tickResponse.json()).toMatchObject({
      firedScheduleIds: [schedule.id],
      workflowRunIds: [expect.any(String)],
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-schedules-route-'));
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

  async function createTestServer(sqlite: Database) {
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(schedulesRoute, { prefix: '/api' });
    await fastify.ready();

    return fastify;
  }
});
