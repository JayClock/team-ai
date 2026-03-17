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
import flowTemplatesRoute from './flow-templates';

describe('flow template routes', () => {
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

  it('lists built-in templates and applies a spec template without syncing tasks', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-flow-template-project',
      title: 'Flow Template Project',
    });

    const listResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/flow-templates`,
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: 'routa-spec-loop',
          noteType: 'spec',
        }),
      ]),
    });

    const applyResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/flow-templates/routa-spec-loop/apply`,
      payload: {
        variables: {
          projectTitle: 'Flow Template Project',
        },
      },
    });

    expect(applyResponse.statusCode).toBe(200);
    expect(applyResponse.json()).toMatchObject({
      appliedTemplate: {
        id: 'routa-spec-loop',
      },
      note: {
        projectId: project.id,
        type: 'spec',
      },
      taskSync: expect.objectContaining({
        createdCount: 0,
        parsedCount: 0,
        skipped: true,
      }),
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-flow-template-'));
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
    await fastify.register(flowTemplatesRoute, { prefix: '/api' });
    await fastify.ready();

    return fastify;
  }
});
