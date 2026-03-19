import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import { createTask, listTasks } from '../services/task-service';
import { createProject } from '../services/project-service';
import { listNotes } from '../services/note-service';
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
      'Blocked',
      'Done',
    ]);
  });

  it('returns a kanban board projection by id', async () => {
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
    const boardColumns = (
      listResponse.json() as {
        _embedded: { boards: Array<{ columns: Array<{ id: string }> }> };
      }
    )._embedded.boards[0].columns;

    await createTask(sqlite, {
      boardId,
      columnId: boardColumns[1]?.id ?? null,
      objective: 'Render card summaries in the board projection',
      projectId: project.id,
      title: 'Projected card',
    });

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
      settings: {
        isDefault: true,
      },
      columns: expect.arrayContaining([
        expect.objectContaining({
          name: 'Todo',
          cards: [expect.objectContaining({ title: 'Projected card' })],
        }),
      ]),
    });
  });

  it('creates and updates custom boards and columns', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/Users/example/kanban-config',
      title: 'Kanban Config',
    });
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(kanbanRoute, { prefix: '/api' });
    await fastify.ready();

    const createBoardResponse = await fastify.inject({
      method: 'POST',
      payload: {
        name: 'Release Board',
      },
      url: `/api/projects/${project.id}/kanban/boards`,
    });

    expect(createBoardResponse.statusCode).toBe(201);
    const createdBoard = createBoardResponse.json() as {
      columns: Array<{ id: string; name: string }>;
      id: string;
      settings: { isDefault: boolean };
    };
    expect(createdBoard).toMatchObject({
      name: 'Release Board',
      settings: {
        isDefault: true,
      },
    });

    const patchBoardResponse = await fastify.inject({
      method: 'PATCH',
      payload: {
        isDefault: true,
        settings: {
          boardConcurrency: 2,
          wipLimit: 5,
        },
      },
      url: `/api/projects/${project.id}/kanban/boards/${createdBoard.id}`,
    });

    expect(patchBoardResponse.statusCode).toBe(200);
    expect(patchBoardResponse.json()).toMatchObject({
      id: createdBoard.id,
      settings: {
        boardConcurrency: 2,
        isDefault: true,
        wipLimit: 5,
      },
    });

    const createColumnResponse = await fastify.inject({
      method: 'POST',
      payload: {
        automation: {
          autoAdvanceOnSuccess: false,
          enabled: true,
          provider: 'codex',
          requiredArtifacts: ['release notes'],
          role: 'GATE',
          specialistId: 'release-gate',
          specialistName: 'Release Gate',
          transitionType: 'entry',
        },
        name: 'Release Gate',
        stage: 'review',
      },
      url: `/api/projects/${project.id}/kanban/boards/${createdBoard.id}/columns`,
    });

    expect(createColumnResponse.statusCode).toBe(201);
    const createdColumnBoard = createColumnResponse.json() as {
      columns: Array<{
        automation: { provider: string | null; requiredArtifacts: string[] } | null;
        id: string;
        name: string;
        stage: string | null;
      }>;
      id: string;
    };
    const createdColumn = createdColumnBoard.columns.find(
      (column) => column.name === 'Release Gate',
    );
    expect(createdColumn).toMatchObject({
      automation: {
        provider: 'codex',
        requiredArtifacts: ['release notes'],
      },
      stage: 'review',
    });

    const patchColumnResponse = await fastify.inject({
      method: 'PATCH',
      payload: {
        name: 'QA Gate',
        position: 0,
      },
      url: `/api/projects/${project.id}/kanban/boards/${createdBoard.id}/columns/${createdColumn?.id}`,
    });

    expect(patchColumnResponse.statusCode).toBe(200);
    expect(
      (
        patchColumnResponse.json() as {
          columns: Array<{ name: string }>;
        }
      ).columns,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'QA Gate' })]));

    const deleteColumnResponse = await fastify.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}/kanban/boards/${createdBoard.id}/columns/${createdColumn?.id}`,
    });

    expect(deleteColumnResponse.statusCode).toBe(200);
    expect(
      (
        deleteColumnResponse.json() as {
          columns: Array<{ name: string }>;
        }
      ).columns,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'QA Gate' })]));
  });

  it('intakes a natural-language goal into spec fragments and kanban cards', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/Users/example/kanban-intake',
      title: 'Kanban Intake',
    });
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(kanbanRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'POST',
      payload: {
        acceptanceHints: ['Users can log in with email and password'],
        artifactHints: ['login screen screenshot', 'test run output'],
        constraints: ['Use the existing auth store', 'Preserve current routing'],
        goal: 'Build a user authentication flow',
      },
      url: `/api/projects/${project.id}/kanban/intake`,
    });

    expect(response.statusCode).toBe(200);
    expect(responseContentType(response)).toBe(VENDOR_MEDIA_TYPES.kanbanIntake);
    expect(response.json()).toMatchObject({
      createdTaskIds: expect.any(Array),
      decomposition: {
        goal: 'Build a user authentication flow',
        tasks: [
          expect.objectContaining({
            kind: 'plan',
            owner: 'Todo Orchestrator',
            title: 'Refine Build a user authentication flow',
          }),
          expect.objectContaining({
            kind: 'implement',
            owner: 'Crafter Implementor',
            title: 'Implement Build a user authentication flow',
          }),
          expect.objectContaining({
            kind: 'review',
            owner: 'Gate Reviewer',
            title: 'Review Build a user authentication flow',
          }),
        ],
      },
      note: {
        projectId: project.id,
        type: 'spec',
      },
      parsedTaskCount: 3,
      specFragment: expect.stringContaining('## Intake Goal · Build a user authentication flow'),
    });

    const notes = await listNotes(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
      type: 'spec',
    });
    expect(notes.total).toBe(1);
    expect(notes.items[0]?.content).toContain('Build a user authentication flow');
    expect(notes.items[0]?.content).toContain('Use the existing auth store');

    const tasks = await listTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
    });
    expect(tasks.total).toBe(3);
    expect(tasks.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'spec_note',
          title: 'Refine Build a user authentication flow',
        }),
        expect.objectContaining({
          sourceType: 'spec_note',
          title: 'Implement Build a user authentication flow',
        }),
        expect.objectContaining({
          sourceType: 'spec_note',
          title: 'Review Build a user authentication flow',
        }),
      ]),
    );

    const secondResponse = await fastify.inject({
      method: 'POST',
      payload: {
        goal: 'Add password reset support',
      },
      url: `/api/projects/${project.id}/kanban/intake`,
    });

    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.json()).toMatchObject({
      parsedTaskCount: 6,
      specFragment: expect.stringContaining('Revision: 2'),
    });

    const refreshedNotes = await listNotes(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
      type: 'spec',
    });
    expect(refreshedNotes.items[0]?.content).toContain('Planning Revision: 2');
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
