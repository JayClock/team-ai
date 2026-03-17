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
import kanbanRoute from './kanban';

describe('kanban route', () => {
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

  it('creates and returns a default workflow board for a project', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/Users/example/kanban-foundation',
      title: 'Kanban Foundation',
    });
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(kanbanRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/kanban/boards`,
    });

    expect(response.statusCode).toBe(200);
    expect(responseContentType(response)).toBe(VENDOR_MEDIA_TYPES.kanbanBoards);
    expect(response.json()).toMatchObject({
      _embedded: {
        boards: [
          {
            name: 'Workflow Board',
            projectId: project.id,
          },
        ],
      },
      total: 1,
    });

    const payload = response.json() as {
      _embedded: {
        boards: Array<{ columns: Array<{ name: string }>; id: string }>;
      };
    };
    expect(payload._embedded.boards[0].columns.map((column) => column.name)).toEqual([
      'Backlog',
      'Todo',
      'Dev',
      'Review',
      'Done',
    ]);
  });

  it('returns a kanban board by id', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/Users/example/kanban-detail',
      title: 'Kanban Detail',
    });
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(kanbanRoute, { prefix: '/api' });
    await fastify.ready();

    const listResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/kanban/boards`,
    });
    const boardId = (
      listResponse.json() as {
        _embedded: { boards: Array<{ id: string }> };
      }
    )._embedded.boards[0].id;

    const detailResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/kanban/boards/${boardId}`,
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(responseContentType(detailResponse)).toBe(VENDOR_MEDIA_TYPES.kanbanBoard);
    expect(detailResponse.json()).toMatchObject({
      id: boardId,
      name: 'Workflow Board',
      projectId: project.id,
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-kanban-route-'));
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
