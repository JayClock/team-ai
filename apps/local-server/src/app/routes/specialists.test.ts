import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import { responseContentType } from '../test-support/response-content-type';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import kanbanRoute from './kanban';
import projectsRoute from './projects';
import specialistsRoute from './specialists';

describe('specialists routes', () => {
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

  it('lists built-in and workspace specialists for a project', async () => {
    const sqlite = await createTestDatabase();
    const repoPath = await mkdtemp(
      join(tmpdir(), 'team-ai-specialists-route-workspace-'),
    );
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });
    await mkdir(join(repoPath, 'resources', 'specialists'), {
      recursive: true,
    });
    await writeFile(
      join(repoPath, 'resources', 'specialists', 'backend-reviewer.md'),
      [
        '---',
        'id: backend-reviewer',
        'name: Backend Reviewer',
        'role: GATE',
        'description: Review backend changes.',
        '---',
        'Review backend changes and verify migration safety.',
      ].join('\n'),
      'utf8',
    );

    const project = await createProjectRecord(sqlite, repoPath);
    const fastify = await createTestServer(sqlite);

    const response = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/specialists`,
    });

    expect(response.statusCode).toBe(200);
    expect(responseContentType(response)).toBe(VENDOR_MEDIA_TYPES.specialists);
    const specialists = response.json()._embedded.specialists as Array<{
      id: string;
      source: { scope: string };
    }>;

    expect(
      specialists.find((specialist) => specialist.id === 'backend-reviewer'),
    ).toMatchObject({
      source: {
        scope: 'workspace',
      },
    });
    expect(
      specialists.find((specialist) => specialist.id === 'routa-coordinator'),
    ).toMatchObject({
      source: {
        scope: 'builtin',
      },
    });
  });

  it('returns specialist detail for a project resource', async () => {
    const sqlite = await createTestDatabase();
    const repoPath = await mkdtemp(
      join(tmpdir(), 'team-ai-specialists-route-detail-'),
    );
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });
    const project = await createProjectRecord(sqlite, repoPath);
    const fastify = await createTestServer(sqlite);

    const response = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/specialists/routa-coordinator`,
    });

    expect(response.statusCode).toBe(200);
    expect(responseContentType(response)).toBe(VENDOR_MEDIA_TYPES.specialist);
    expect(response.json()).toMatchObject({
      id: 'routa-coordinator',
      role: 'ROUTA',
      _links: {
        self: {
          href: `/api/projects/${project.id}/specialists/routa-coordinator`,
        },
      },
    });
  });

  it('creates, updates, and protects user specialists referenced by kanban columns', async () => {
    const sqlite = await createTestDatabase();
    const repoPath = await mkdtemp(
      join(tmpdir(), 'team-ai-specialists-route-crud-'),
    );
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });
    const project = await createProjectRecord(sqlite, repoPath);
    const fastify = await createTestServer(sqlite, {
      withKanban: true,
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      payload: {
        defaultAdapter: 'codex',
        description: 'Owns product planning',
        id: 'planner-override',
        name: 'Planner Override',
        role: 'ROUTA',
        systemPrompt: 'Plan work and keep the spec synchronized.',
      },
      url: `/api/projects/${project.id}/specialists`,
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      id: 'planner-override',
      source: {
        scope: 'user',
      },
    });

    const updateResponse = await fastify.inject({
      method: 'PATCH',
      payload: {
        description: 'Owns product planning and wave refinement',
      },
      url: `/api/projects/${project.id}/specialists/planner-override`,
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      description: 'Owns product planning and wave refinement',
      id: 'planner-override',
    });

    const boardsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/kanban/boards`,
    });
    const board = (boardsResponse.json() as {
      _embedded: {
        boards: Array<{
          columns: Array<{ id: string; name: string }>;
          id: string;
        }>;
      };
    })._embedded.boards[0];
    const todoColumn = board.columns.find((column) => column.name === 'Todo');

    const patchColumnResponse = await fastify.inject({
      method: 'PATCH',
      payload: {
        automation: {
          enabled: true,
          role: 'ROUTA',
          specialistId: 'planner-override',
          specialistName: 'Planner Override',
          transitionType: 'entry',
        },
      },
      url: `/api/projects/${project.id}/kanban/boards/${board.id}/columns/${todoColumn?.id}`,
    });

    expect(patchColumnResponse.statusCode).toBe(200);

    const deleteConflictResponse = await fastify.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}/specialists/planner-override`,
    });

    expect(deleteConflictResponse.statusCode).toBe(409);

    await fastify.inject({
      method: 'PATCH',
      payload: {
        automation: null,
      },
      url: `/api/projects/${project.id}/kanban/boards/${board.id}/columns/${todoColumn?.id}`,
    });

    const deleteResponse = await fastify.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}/specialists/planner-override`,
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toMatchObject({
      id: 'planner-override',
      source: {
        scope: 'user',
      },
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-specialists-route-'));
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

  async function createTestServer(
    sqlite: Database,
    options: {
      withKanban?: boolean;
    } = {},
  ) {
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(projectsRoute, { prefix: '/api' });
    await fastify.register(specialistsRoute, { prefix: '/api' });
    if (options.withKanban) {
      await fastify.register(kanbanRoute, { prefix: '/api' });
    }
    await fastify.ready();

    return fastify;
  }

  async function createProjectRecord(sqlite: Database, repoPath: string) {
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);
    await fastify.register(problemJsonPlugin);
    await fastify.register(projectsRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'POST',
      payload: {
        repoPath,
        title: 'Specialists Project',
      },
      url: '/api/projects',
    });

    expect(response.statusCode).toBe(201);

    return response.json() as { id: string };
  }
});
