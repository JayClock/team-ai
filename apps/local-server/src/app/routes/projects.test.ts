import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import projectsRoute from './projects';

describe('projects route', () => {
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

  it('creates projects with repoPath', async () => {
    const sqlite = await createTestDatabase();
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(projectsRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        title: 'Team AI',
        repoPath: '/Users/example/team-ai',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      title: 'Team AI',
      repoPath: '/Users/example/team-ai',
    });
  });

  it('rejects invalid repository URLs when cloning a project', async () => {
    const sqlite = await createTestDatabase();
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(projectsRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/projects/clone',
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

  it('filters projects by repoPath', async () => {
    const sqlite = await createTestDatabase();
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(projectsRoute, { prefix: '/api' });
    await fastify.ready();

    const createResponse = await fastify.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        title: 'Team AI',
        repoPath: '/Users/example/team-ai',
      },
    });
    const project = createResponse.json() as { id: string };

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/projects?repoPath=%2FUsers%2Fexample%2Fteam-ai',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      _embedded: {
        projects: [
          {
            id: project.id,
            repoPath: '/Users/example/team-ai',
          },
        ],
      },
      total: 1,
    });
  });

  it('exposes project links for tasks, agents, and acp sessions', async () => {
    const sqlite = await createTestDatabase();
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(projectsRoute, { prefix: '/api' });
    await fastify.ready();

    const createResponse = await fastify.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        title: 'Desktop Links',
        repoPath: '/Users/example/desktop-links',
      },
    });
    const project = createResponse.json() as { id: string };

    const response = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: project.id,
      _links: {
        self: {
          href: `/api/projects/${project.id}`,
        },
        collection: {
          href: '/api/projects',
        },
        tasks: {
          href: `/api/projects/${project.id}/tasks`,
        },
        agents: {
          href: `/api/projects/${project.id}/agents`,
        },
        specialists: {
          href: `/api/projects/${project.id}/specialists`,
        },
        roles: {
          href: '/api/roles',
        },
        'acp-sessions': {
          href: `/api/projects/${project.id}/acp-sessions`,
        },
      },
    });
    expect(response.json()._links.sessions).toBeUndefined();
    expect(response.json()._links.conversations).toBeUndefined();
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-project-route-'));
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
