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
import { insertAcpSession } from '../test-support/acp-session-fixture';
import notesRoute from './notes';

describe('notes routes', () => {
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

  it('creates project and session notes and lists them through scoped collections', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Notes Project',
      repoPath: '/tmp/team-ai-notes-project',
    });
    const sessionId = createAcpSession(sqlite, project.id, 'Notes session');

    const projectNoteResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/notes`,
      payload: {
        content: '# Spec',
        title: 'Workspace Spec',
        type: 'spec',
      },
    });

    expect(projectNoteResponse.statusCode).toBe(201);
    const projectNote = projectNoteResponse.json() as { id: string };

    const sessionNoteResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/acp-sessions/${sessionId}/notes`,
      payload: {
        assignedAgentIds: ['agent_1'],
        content: 'Session scoped note',
        title: 'Session Note',
        type: 'general',
      },
    });

    expect(sessionNoteResponse.statusCode).toBe(201);
    const sessionNote = sessionNoteResponse.json() as { id: string };
    expect(sessionNoteResponse.json()).toMatchObject({
      sessionId,
      _links: {
        session: {
          href: `/api/projects/${project.id}/acp-sessions/${sessionId}`,
        },
      },
    });

    const projectNotesResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/notes`,
    });

    expect(projectNotesResponse.statusCode).toBe(200);
    expect(projectNotesResponse.json()).toMatchObject({
      total: 2,
      _embedded: {
        notes: [
          expect.objectContaining({ id: sessionNote.id }),
          expect.objectContaining({ id: projectNote.id }),
        ],
      },
    });

    const sessionNotesResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions/${sessionId}/notes`,
    });

    expect(sessionNotesResponse.statusCode).toBe(200);
    expect(sessionNotesResponse.json()).toMatchObject({
      total: 1,
      _embedded: {
        notes: [expect.objectContaining({ id: sessionNote.id })],
      },
    });
  });

  it('updates and deletes notes from the note detail routes', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Mutable Notes',
      repoPath: '/tmp/team-ai-mutable-notes',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/notes`,
      payload: {
        title: 'Initial Note',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const noteId = (createResponse.json() as { id: string }).id;

    const patchResponse = await fastify.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}`,
      payload: {
        content: 'Updated note content',
        source: 'agent',
        title: 'Updated Note',
      },
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toMatchObject({
      content: 'Updated note content',
      id: noteId,
      source: 'agent',
      title: 'Updated Note',
    });

    const deleteResponse = await fastify.inject({
      method: 'DELETE',
      url: `/api/notes/${noteId}`,
    });

    expect(deleteResponse.statusCode).toBe(204);

    const detailResponse = await fastify.inject({
      method: 'GET',
      url: `/api/notes/${noteId}`,
    });

    expect(detailResponse.statusCode).toBe(404);
    expect(detailResponse.json()).toMatchObject({
      title: 'Note Not Found',
      type: 'https://team-ai.dev/problems/note-not-found',
    });
  });

  it('rejects cross-project session note creation and missing projectId queries', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const projectA = await createProject(sqlite, {
      title: 'Project A',
      repoPath: '/tmp/team-ai-notes-project-a',
    });
    const projectB = await createProject(sqlite, {
      title: 'Project B',
      repoPath: '/tmp/team-ai-notes-project-b',
    });
    const sessionId = createAcpSession(sqlite, projectA.id, 'Foreign session');

    const crossProjectResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${projectB.id}/acp-sessions/${sessionId}/notes`,
      payload: {
        title: 'Should fail',
      },
    });

    expect(crossProjectResponse.statusCode).toBe(404);

    const missingProjectQueryResponse = await fastify.inject({
      method: 'GET',
      url: '/api/notes',
    });

    expect(missingProjectQueryResponse.statusCode).toBe(400);
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-notes-route-'));
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
    await fastify.register(notesRoute, { prefix: '/api' });
    await fastify.ready();

    return fastify;
  }

  function createAcpSession(
    sqlite: Database,
    projectId: string,
    title: string,
  ) {
    const sessionId = `acps_${Math.random().toString(36).slice(2, 10)}`;
    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-notes-project',
      id: sessionId,
      name: title,
      projectId,
    });
    return sessionId;
  }
});
