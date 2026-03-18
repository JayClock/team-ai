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
import flowsRoute from './flows';

describe('flows route', () => {
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

  it('lists built-in flows, fetches a flow resource, and triggers runs', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-flows-route-project',
      title: 'Flows Project',
    });

    const listResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/flows`,
    });

    expect(listResponse.statusCode).toBe(200);
    expect(responseContentType(listResponse)).toBe(VENDOR_MEDIA_TYPES.flows);
    expect(listResponse.json()).toMatchObject({
      _embedded: {
        flows: expect.arrayContaining([
          expect.objectContaining({
            id: 'simple-dev',
            name: 'Simple Developer Task',
          }),
        ]),
      },
    });

    const getResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/flows/simple-dev`,
    });

    expect(getResponse.statusCode).toBe(200);
    expect(responseContentType(getResponse)).toBe(VENDOR_MEDIA_TYPES.flow);
    expect(getResponse.json()).toMatchObject({
      id: 'simple-dev',
      _links: {
        runs: {
          href: `/api/projects/${project.id}/flows/simple-dev/runs`,
        },
        trigger: {
          href: `/api/projects/${project.id}/flows/simple-dev/trigger`,
        },
      },
      steps: [
        expect.objectContaining({
          name: 'Execute Task',
          specialistId: 'developer',
        }),
      ],
      trigger: {
        type: 'manual',
      },
    });

    const triggerResponse = await fastify.inject({
      method: 'POST',
      payload: {
        triggerPayload: 'Run the developer flow',
      },
      url: `/api/projects/${project.id}/flows/simple-dev/trigger`,
    });

    expect(triggerResponse.statusCode).toBe(202);
    expect(responseContentType(triggerResponse)).toBe(
      VENDOR_MEDIA_TYPES.workflowRun,
    );
    expect(triggerResponse.json()).toMatchObject({
      triggerPayload: 'Run the developer flow',
      workflowName: 'Flow · Simple Developer Task',
    });

    const runsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/flows/simple-dev/runs`,
    });

    expect(runsResponse.statusCode).toBe(200);
    expect(responseContentType(runsResponse)).toBe(
      VENDOR_MEDIA_TYPES.workflowRuns,
    );
    expect(runsResponse.json()).toMatchObject({
      _embedded: {
        workflowRuns: [
          expect.objectContaining({
            triggerPayload: 'Run the developer flow',
            workflowName: 'Flow · Simple Developer Task',
          }),
        ],
      },
    });

    const workflowRunId = runsResponse.json()._embedded.workflowRuns[0].id as string;
    const runResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/flows/simple-dev/runs/${workflowRunId}`,
    });

    expect(runResponse.statusCode).toBe(200);
    expect(responseContentType(runResponse)).toBe(
      VENDOR_MEDIA_TYPES.workflowRun,
    );
    expect(runResponse.json()).toMatchObject({
      id: workflowRunId,
      workflowName: 'Flow · Simple Developer Task',
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-flows-route-'));
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
    await fastify.register(flowsRoute, { prefix: '/api' });
    await fastify.ready();

    return fastify;
  }
});
