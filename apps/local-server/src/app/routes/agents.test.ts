import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import { createProject } from '../services/project-service';
import { responseContentType } from '../test-support/response-content-type';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import agentsRoute from './agents';

describe('agents route', () => {
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

  it('creates and lists project agents', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Route Project',
      repoPath: '/Users/example/route-project',
    });
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(agentsRoute, { prefix: '/api' });
    await fastify.ready();

    const createResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/agents`,
      payload: {
        name: 'Planner',
        role: 'planner',
        provider: 'codex',
        model: 'gpt-5',
        systemPrompt: 'Plan and coordinate.',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(responseContentType(createResponse)).toBe(VENDOR_MEDIA_TYPES.agent);
    expect(createResponse.json()).toMatchObject({
      projectId: project.id,
      name: 'Planner',
      _links: {
        collection: {
          href: `/api/projects/${project.id}/agents`,
        },
      },
    });

    const listResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/agents`,
    });

    expect(listResponse.statusCode).toBe(200);
    expect(responseContentType(listResponse)).toBe(VENDOR_MEDIA_TYPES.agents);
    expect(listResponse.json()).toMatchObject({
      _embedded: {
        agents: [
          {
            projectId: project.id,
            name: 'Planner',
          },
        ],
      },
      _links: {
        project: {
          href: `/api/projects/${project.id}`,
        },
      },
      total: 1,
    });
  });

  it('updates and deletes project agents', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Mutation Project',
      repoPath: '/Users/example/mutation-project',
    });
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(agentsRoute, { prefix: '/api' });
    await fastify.ready();

    const createResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/agents`,
      payload: {
        name: 'Reviewer',
        role: 'reviewer',
        provider: 'codex',
        model: 'gpt-5-mini',
      },
    });
    const created = createResponse.json() as { id: string };

    const patchResponse = await fastify.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}/agents/${created.id}`,
      payload: {
        name: 'Lead Reviewer',
      },
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(responseContentType(patchResponse)).toBe(VENDOR_MEDIA_TYPES.agent);
    expect(patchResponse.json()).toMatchObject({
      id: created.id,
      projectId: project.id,
      name: 'Lead Reviewer',
    });

    const deleteResponse = await fastify.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}/agents/${created.id}`,
    });

    expect(deleteResponse.statusCode).toBe(204);

    const getResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/agents/${created.id}`,
    });

    expect(getResponse.statusCode).toBe(404);
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-agent-route-'));
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
