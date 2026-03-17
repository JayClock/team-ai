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
import webhooksRoute from './webhooks';

describe('webhook routes', () => {
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

  it('creates configs, receives github webhooks, and exposes webhook logs', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-webhook-routes',
      title: 'Webhook Routes',
    });
    const workflow = await createWorkflow(sqlite, {
      name: 'Webhook workflow',
      projectId: project.id,
      steps: [
        {
          name: 'Handle webhook',
          parallelGroup: null,
          prompt: 'Handle ${trigger.payload}',
          specialistId: 'backend-crafter',
        },
      ],
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      payload: {
        eventTypes: ['pull_request'],
        name: 'PR webhook',
        projectId: project.id,
        repo: 'acme/platform',
        workflowId: workflow.id,
      },
      url: '/api/webhooks/configs',
    });

    expect(createResponse.statusCode).toBe(201);
    expect(responseContentType(createResponse)).toBe(
      VENDOR_MEDIA_TYPES.webhookConfig,
    );
    const config = createResponse.json() as { id: string };

    const listResponse = await fastify.inject({
      method: 'GET',
      url: `/api/webhooks/configs?projectId=${project.id}`,
    });

    expect(listResponse.statusCode).toBe(200);
    expect(responseContentType(listResponse)).toBe(
      VENDOR_MEDIA_TYPES.webhookConfigs,
    );
    expect(listResponse.json()).toMatchObject({
      _embedded: {
        webhookConfigs: [expect.objectContaining({ id: config.id })],
      },
    });

    const payload = JSON.stringify({
      action: 'opened',
      pull_request: {
        number: 42,
        title: 'Webhook route coverage',
      },
      repository: {
        full_name: 'acme/platform',
      },
    });
    const webhookResponse = await fastify.inject({
      method: 'POST',
      payload,
      headers: {
        'content-type': 'application/json',
        'x-github-delivery': 'delivery-route-1',
        'x-github-event': 'pull_request',
      },
      url: '/api/webhooks/github',
    });

    expect(webhookResponse.statusCode).toBe(200);
    expect(webhookResponse.json()).toMatchObject({
      ok: true,
      processed: 1,
      skipped: 0,
    });

    const logsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/webhooks/webhook-logs?configId=${config.id}`,
    });

    expect(logsResponse.statusCode).toBe(200);
    expect(responseContentType(logsResponse)).toBe(
      VENDOR_MEDIA_TYPES.webhookLogs,
    );
    expect(logsResponse.json()).toMatchObject({
      _embedded: {
        webhookLogs: [
          expect.objectContaining({
            configId: config.id,
            eventAction: 'opened',
            eventType: 'pull_request',
            outcome: 'triggered',
          }),
        ],
      },
    });

    const healthResponse = await fastify.inject({
      method: 'GET',
      url: '/api/webhooks/github',
    });
    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.json()).toMatchObject({
      endpoint: 'GitHub Webhook Receiver',
      status: 'ok',
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-webhook-routes-'));
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
    await fastify.register(webhooksRoute, { prefix: '/api' });
    await fastify.ready();

    return fastify;
  }
});
