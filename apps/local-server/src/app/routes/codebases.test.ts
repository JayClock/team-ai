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
import codebasesRoute from './codebases';

describe('codebases route', () => {
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

  it('lists project codebases from the workspace collection', async () => {
    const sqlite = await createTestDatabase();
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(codebasesRoute, { prefix: '/api' });
    await fastify.ready();

    const project = await createProject(sqlite, {
      title: 'Workspace Root',
      repoPath: '/Users/example/workspace-root',
      sourceType: 'github',
      sourceUrl: 'https://github.com/example/workspace-root',
    });

    const response = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/codebases`,
    });

    expect(response.statusCode).toBe(200);
    expect(responseContentType(response)).toBe(VENDOR_MEDIA_TYPES.codebases);
    expect(response.json()).toMatchObject({
      _embedded: {
        codebases: [
          {
            isDefault: true,
            projectId: project.id,
            repoPath: '/Users/example/workspace-root',
            sourceUrl: 'https://github.com/example/workspace-root',
            title: 'Workspace Root',
          },
        ],
      },
      _links: {
        self: {
          href: `/api/projects/${project.id}/codebases`,
        },
      },
    });
  });

  it('rejects invalid repository URLs when cloning a codebase', async () => {
    const sqlite = await createTestDatabase();
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(codebasesRoute, { prefix: '/api' });
    await fastify.ready();

    const project = await createProject(sqlite, {
      title: 'Workspace Root',
      repoPath: '/Users/example/workspace-root',
    });

    const response = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/codebases/clone`,
      payload: {
        repositoryUrl: 'not-a-github-repo',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      title: 'Invalid Repository URL',
      type: 'https://team-ai.dev/problems/invalid-repository-url',
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-codebase-route-'));
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

