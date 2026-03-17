import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcpRuntimeClient } from '../clients/acp-runtime-client';
import acpStreamPlugin from '../plugins/acp-stream';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import sqlitePlugin from '../plugins/sqlite';
import { ensureDefaultKanbanBoard } from '../services/kanban-board-service';
import { createProject } from '../services/project-service';
import { createTask } from '../services/task-service';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import { responseContentType } from '../test-support/response-content-type';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import acpRoute from './acp';

describe('acp session context route', () => {
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];
  const dataDirs: string[] = [];
  const originalDataDir = process.env.TEAMAI_DATA_DIR;

  afterEach(async () => {
    process.env.TEAMAI_DATA_DIR = originalDataDir;

    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }

    while (dataDirs.length > 0) {
      const dataDir = dataDirs.pop();
      if (dataDir) {
        await rm(dataDir, { recursive: true, force: true });
      }
    }
  });

  it('returns session context with kanban history details', async () => {
    const dataDir = await mkdtemp(
      join(tmpdir(), 'team-ai-acp-session-context-route-'),
    );
    dataDirs.push(dataDir);
    process.env.TEAMAI_DATA_DIR = dataDir;

    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(),
      promptSession: vi.fn(),
    } satisfies AcpRuntimeClient);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(acpRoute, { prefix: '/api' });
    await fastify.ready();

    const project = await createProject(fastify.sqlite, {
      repoPath: '/tmp/team-ai-acp-session-context-route',
      title: 'ACP Session Context Route',
    });
    const board = await ensureDefaultKanbanBoard(fastify.sqlite, project.id);
    insertAcpSession(fastify.sqlite, {
      id: 'acps_route_prev',
      projectId: project.id,
    });
    insertAcpSession(fastify.sqlite, {
      id: 'acps_route_current',
      projectId: project.id,
    });

    await createTask(fastify.sqlite, {
      boardId: board.id,
      columnId: board.columns[2]?.id ?? null,
      laneHandoffs: [
        {
          fromColumnId: board.columns[1]?.id,
          fromSessionId: 'acps_route_prev',
          id: 'handoff_route_1',
          request: 'Provide runtime context',
          requestType: 'runtime_context',
          requestedAt: '2026-03-17T00:00:00.000Z',
          status: 'requested',
          toColumnId: board.columns[2]?.id,
          toSessionId: 'acps_route_current',
        },
      ],
      laneSessions: [
        {
          columnId: board.columns[1]?.id,
          columnName: board.columns[1]?.name,
          sessionId: 'acps_route_prev',
          startedAt: '2026-03-17T00:00:00.000Z',
          status: 'completed',
        },
        {
          columnId: board.columns[2]?.id,
          columnName: board.columns[2]?.name,
          sessionId: 'acps_route_current',
          startedAt: '2026-03-17T00:01:00.000Z',
          status: 'running',
        },
      ],
      objective: 'Serve session context',
      projectId: project.id,
      sessionIds: ['acps_route_current'],
      title: 'Serve session context',
    });

    const response = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions/acps_route_current/context`,
    });

    expect(response.statusCode).toBe(200);
    expect(responseContentType(response)).toBe(
      VENDOR_MEDIA_TYPES.acpSessionContext,
    );
    expect(response.json()).toMatchObject({
      sessionId: 'acps_route_current',
      kanban: {
        boardId: board.id,
        columnId: board.columns[2]?.id,
        currentLaneSession: {
          sessionId: 'acps_route_current',
        },
        previousLaneSession: {
          sessionId: 'acps_route_prev',
        },
        relatedHandoffs: [
          expect.objectContaining({
            direction: 'incoming',
            id: 'handoff_route_1',
          }),
        ],
      },
    });
  });
});
