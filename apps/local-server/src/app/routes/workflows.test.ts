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
import { responseContentType } from '../test-support/response-content-type';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import workflowsRoute from './workflows';

describe('workflow routes', () => {
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

  it('creates, lists, and triggers workflows', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-workflow-routes',
      title: 'Workflow Routes',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      payload: {
        description: 'Ship a routa-style slice.',
        name: 'Ship slice',
        steps: [
          {
            name: 'Implement',
            prompt: 'Implement ${trigger.payload}',
            specialistId: 'backend-crafter',
          },
          {
            name: 'Review',
            prompt: 'Review the slice',
            specialistId: 'gate-reviewer',
          },
        ],
      },
      url: `/api/projects/${project.id}/workflows`,
    });

    expect(createResponse.statusCode).toBe(201);
    expect(responseContentType(createResponse)).toBe(VENDOR_MEDIA_TYPES.workflow);
    const workflow = createResponse.json() as { id: string };

    const listResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/workflows`,
    });

    expect(listResponse.statusCode).toBe(200);
    expect(responseContentType(listResponse)).toBe(VENDOR_MEDIA_TYPES.workflows);
    expect(listResponse.json()).toMatchObject({
      _embedded: {
        workflows: [expect.objectContaining({ id: workflow.id, name: 'Ship slice' })],
      },
    });

    const triggerResponse = await fastify.inject({
      method: 'POST',
      payload: {
        triggerPayload: 'the delivery slice',
      },
      url: `/api/workflows/${workflow.id}/trigger`,
    });

    expect(triggerResponse.statusCode).toBe(202);
    expect(responseContentType(triggerResponse)).toBe(VENDOR_MEDIA_TYPES.workflowRun);
    expect(triggerResponse.json()).toMatchObject({
      status: 'RUNNING',
      totalSteps: 2,
      triggerPayload: 'the delivery slice',
      workflowId: workflow.id,
      workflowName: 'Ship slice',
    });

    const runsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/workflows/${workflow.id}/runs`,
    });

    expect(runsResponse.statusCode).toBe(200);
    expect(responseContentType(runsResponse)).toBe(VENDOR_MEDIA_TYPES.workflowRuns);
    expect(runsResponse.json()).toMatchObject({
      _embedded: {
        workflowRuns: [expect.objectContaining({ workflowId: workflow.id })],
      },
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-workflows-route-'));
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
    await fastify.register(workflowsRoute, { prefix: '/api' });
    await fastify.ready();

    return fastify;
  }
});
