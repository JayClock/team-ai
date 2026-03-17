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
      blockedSteps: 1,
      steps: [
        expect.objectContaining({
          blockedByStepNames: [],
          dependsOnStepNames: [],
          name: 'Implement',
          specialistId: 'backend-crafter',
          status: 'PENDING',
        }),
        expect.objectContaining({
          blockedByStepNames: ['Implement'],
          dependsOnStepNames: ['Implement'],
          name: 'Review',
          specialistId: 'gate-reviewer',
          status: 'BLOCKED',
        }),
      ],
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
        workflowRuns: [
          expect.objectContaining({
            workflowId: workflow.id,
            blockedSteps: 1,
            steps: [
              expect.objectContaining({
                blockedByStepNames: [],
                dependsOnStepNames: [],
                name: 'Implement',
                status: 'PENDING',
              }),
              expect.objectContaining({
                blockedByStepNames: ['Implement'],
                dependsOnStepNames: ['Implement'],
                name: 'Review',
                status: 'BLOCKED',
              }),
            ],
          }),
        ],
      },
    });
  });

  it('reconciles and cancels a workflow run', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-workflow-routes-actions',
      title: 'Workflow Route Actions',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      payload: {
        name: 'Actionable flow',
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
    const workflow = createResponse.json() as { id: string };

    const triggerResponse = await fastify.inject({
      method: 'POST',
      payload: {
        triggerPayload: 'the route action slice',
      },
      url: `/api/workflows/${workflow.id}/trigger`,
    });
    const workflowRun = triggerResponse.json() as { id: string };

    const reconcileResponse = await fastify.inject({
      method: 'POST',
      url: `/api/workflow-runs/${workflowRun.id}/reconcile`,
    });

    expect(reconcileResponse.statusCode).toBe(202);
    expect(responseContentType(reconcileResponse)).toBe(
      VENDOR_MEDIA_TYPES.workflowRun,
    );
    expect(reconcileResponse.json()).toMatchObject({
      id: workflowRun.id,
      status: 'RUNNING',
    });

    const cancelResponse = await fastify.inject({
      method: 'POST',
      url: `/api/workflow-runs/${workflowRun.id}/cancel`,
    });

    expect(cancelResponse.statusCode).toBe(202);
    expect(responseContentType(cancelResponse)).toBe(VENDOR_MEDIA_TYPES.workflowRun);
    expect(cancelResponse.json()).toMatchObject({
      currentStepName: null,
      id: workflowRun.id,
      status: 'CANCELLED',
      steps: [
        expect.objectContaining({
          name: 'Implement',
          status: 'CANCELLED',
        }),
        expect.objectContaining({
          name: 'Review',
          status: 'CANCELLED',
        }),
      ],
    });

    const retryResponse = await fastify.inject({
      method: 'POST',
      url: `/api/workflow-runs/${workflowRun.id}/retry`,
    });

    expect(retryResponse.statusCode).toBe(202);
    expect(responseContentType(retryResponse)).toBe(VENDOR_MEDIA_TYPES.workflowRun);
    expect(retryResponse.json()).toMatchObject({
      id: expect.any(String),
      status: 'RUNNING',
      triggerPayload: 'the route action slice',
      workflowId: workflow.id,
      workflowName: 'Actionable flow',
    });
    expect((retryResponse.json() as { id: string }).id).not.toBe(workflowRun.id);
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
