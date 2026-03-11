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
import projectSessionsRoute from './project-sessions';
import sessionsRoute from './sessions';

describe('sessions routes', () => {
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

  it('creates sessions and exposes detail, history, and context routes', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Desktop Project',
      repoPath: '/tmp/team-ai-desktop-project',
    });

    const rootResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/sessions`,
      payload: {
        metadata: {
          mode: 'ROUTA',
        },
        status: 'ACTIVE',
        title: 'Root session',
      },
    });

    expect(rootResponse.statusCode).toBe(201);
    expect(rootResponse.headers.location).toMatch(/^\/api\/sessions\/sess_/);

    const rootSession = rootResponse.json() as {
      id: string;
      _links: Record<string, { href: string }>;
    };
    expect(rootSession).toMatchObject({
      metadata: {
        mode: 'ROUTA',
      },
      projectId: project.id,
      status: 'ACTIVE',
      title: 'Root session',
      _links: {
        self: {
          href: rootResponse.headers.location,
        },
        collection: {
          href: `/api/projects/${project.id}/sessions`,
        },
        context: {
          href: `/api/sessions/${rootSession.id}/context`,
        },
        history: {
          href: `/api/sessions/${rootSession.id}/history`,
        },
      },
    });

    const childResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/sessions`,
      payload: {
        parentSessionId: rootSession.id,
        title: 'Child session',
      },
    });

    expect(childResponse.statusCode).toBe(201);
    const childSession = childResponse.json() as { id: string };

    const detailResponse = await fastify.inject({
      method: 'GET',
      url: `/api/sessions/${childSession.id}`,
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      id: childSession.id,
      metadata: {},
      parentSessionId: rootSession.id,
      projectId: project.id,
      status: 'ACTIVE',
      title: 'Child session',
    });

    const historyResponse = await fastify.inject({
      method: 'GET',
      url: `/api/sessions/${childSession.id}/history`,
    });

    expect(historyResponse.statusCode).toBe(200);
    expect(historyResponse.json()).toMatchObject({
      _embedded: {
        sessions: [
          expect.objectContaining({
            id: rootSession.id,
            title: 'Root session',
          }),
          expect.objectContaining({
            id: childSession.id,
            title: 'Child session',
          }),
        ],
      },
      currentSessionId: childSession.id,
    });

    const contextResponse = await fastify.inject({
      method: 'GET',
      url: `/api/sessions/${rootSession.id}/context`,
    });

    expect(contextResponse.statusCode).toBe(200);
    expect(contextResponse.json()).toMatchObject({
      current: expect.objectContaining({
        id: rootSession.id,
      }),
      parent: null,
      children: [
        expect.objectContaining({
          id: childSession.id,
        }),
      ],
    });
  });

  it('lists sessions from project and global entrypoints with status filtering', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const projectA = await createProject(sqlite, {
      title: 'Desktop Runtime',
      repoPath: '/tmp/team-ai-project-a',
    });
    const projectB = await createProject(sqlite, {
      title: 'Agent Gateway',
      repoPath: '/tmp/team-ai-project-b',
    });

    await createSession(fastify, projectA.id, {
      status: 'ACTIVE',
      title: 'Desktop root',
    });
    await createSession(fastify, projectB.id, {
      status: 'PAUSED',
      title: 'Gateway root',
    });

    const projectSessionsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${projectA.id}/sessions`,
    });

    expect(projectSessionsResponse.statusCode).toBe(200);
    expect(projectSessionsResponse.json()).toMatchObject({
      _links: {
        self: {
          href: `/api/projects/${projectA.id}/sessions?page=1&pageSize=20`,
        },
      },
      total: 1,
    });
    expect(projectSessionsResponse.json()._embedded.sessions).toHaveLength(1);
    expect(projectSessionsResponse.json()._embedded.sessions[0]).toMatchObject({
      projectId: projectA.id,
      title: 'Desktop root',
    });

    const globalSessionsResponse = await fastify.inject({
      method: 'GET',
      url: '/api/sessions',
    });

    expect(globalSessionsResponse.statusCode).toBe(200);
    expect(globalSessionsResponse.json()).toMatchObject({
      _links: {
        self: {
          href: '/api/sessions?page=1&pageSize=20',
        },
      },
      total: 2,
    });

    const filteredSessionsResponse = await fastify.inject({
      method: 'GET',
      url: '/api/sessions?status=PAUSED',
    });

    expect(filteredSessionsResponse.statusCode).toBe(200);
    expect(filteredSessionsResponse.json()).toMatchObject({
      total: 1,
      _embedded: {
        sessions: [
          expect.objectContaining({
            projectId: projectB.id,
            status: 'PAUSED',
            title: 'Gateway root',
          }),
        ],
      },
    });
  });

  it('updates and deletes sessions through session detail routes', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Session Controls',
      repoPath: '/tmp/team-ai-controls',
    });
    const sessionId = await createSession(fastify, project.id, {
      title: 'Session controls',
    });

    const patchResponse = await fastify.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}`,
      payload: {
        metadata: {
          lane: 'research',
        },
        status: 'PAUSED',
        title: 'Session controls updated',
      },
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toMatchObject({
      id: sessionId,
      metadata: {
        lane: 'research',
      },
      status: 'PAUSED',
      title: 'Session controls updated',
    });

    const deleteResponse = await fastify.inject({
      method: 'DELETE',
      url: `/api/sessions/${sessionId}`,
    });

    expect(deleteResponse.statusCode).toBe(204);

    const detailResponse = await fastify.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}`,
    });

    expect(detailResponse.statusCode).toBe(404);
    expect(detailResponse.json()).toMatchObject({
      title: 'Session Not Found',
      type: 'https://team-ai.dev/problems/session-not-found',
    });
  });

  it('rejects empty patch payloads and cyclic parent reassignment', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Patch Guardrails',
      repoPath: '/tmp/team-ai-patch-guardrails',
    });
    const rootId = await createSession(fastify, project.id, {
      title: 'Root',
    });
    const childId = await createSession(fastify, project.id, {
      parentSessionId: rootId,
      title: 'Child',
    });

    const emptyPatchResponse = await fastify.inject({
      method: 'PATCH',
      url: `/api/sessions/${rootId}`,
      payload: {},
    });

    expect(emptyPatchResponse.statusCode).toBe(400);

    const cyclicPatchResponse = await fastify.inject({
      method: 'PATCH',
      url: `/api/sessions/${rootId}`,
      payload: {
        parentSessionId: childId,
      },
    });

    expect(cyclicPatchResponse.statusCode).toBe(409);
    expect(cyclicPatchResponse.json()).toMatchObject({
      title: 'Session Hierarchy Cycle',
      type: 'https://team-ai.dev/problems/session-hierarchy-cycle',
    });
  });

  it('rejects parent sessions from a different project', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const projectA = await createProject(sqlite, {
      title: 'Project A',
      repoPath: '/tmp/team-ai-project-aa',
    });
    const projectB = await createProject(sqlite, {
      title: 'Project B',
      repoPath: '/tmp/team-ai-project-bb',
    });
    const foreignParentId = await createSession(fastify, projectA.id, {
      title: 'Foreign parent',
    });

    const response = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${projectB.id}/sessions`,
      payload: {
        parentSessionId: foreignParentId,
        title: 'Invalid child',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      title: 'Session Parent Project Mismatch',
      type: 'https://team-ai.dev/problems/session-parent-project-mismatch',
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-sessions-route-'));
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
    await fastify.register(projectSessionsRoute, { prefix: '/api' });
    await fastify.register(sessionsRoute, { prefix: '/api' });
    await fastify.ready();

    return fastify;
  }

  async function createSession(
    fastify: ReturnType<typeof Fastify>,
    projectId: string,
    payload: {
      parentSessionId?: string;
      status?: string;
      title: string;
    },
  ) {
    const response = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/sessions`,
      payload,
    });

    expect(response.statusCode).toBe(201);

    return (response.json() as { id: string }).id;
  }
});
