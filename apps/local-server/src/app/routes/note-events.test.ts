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
import { responseContentType } from '../test-support/response-content-type';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import noteEventsRoute from './note-events';
import notesRoute from './notes';

describe('note events routes', () => {
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

  it('records note lifecycle events and exposes them from the project event feed', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Note Events',
      repoPath: '/tmp/team-ai-note-events',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/notes`,
      payload: {
        content: 'Initial content',
        title: 'Tracked Note',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const noteId = (createResponse.json() as { id: string }).id;

    const updateResponse = await fastify.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}`,
      payload: {
        content: 'Updated content',
      },
    });

    expect(updateResponse.statusCode).toBe(200);

    const deleteResponse = await fastify.inject({
      method: 'DELETE',
      url: `/api/notes/${noteId}`,
    });

    expect(deleteResponse.statusCode).toBe(204);

    const eventsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/note-events`,
    });

    expect(eventsResponse.statusCode).toBe(200);
    expect(responseContentType(eventsResponse)).toBe(
      VENDOR_MEDIA_TYPES.noteEvents,
    );
    expect(eventsResponse.json()).toMatchObject({
      total: 3,
      _embedded: {
        noteEvents: [
          expect.objectContaining({
            noteId,
            type: 'deleted',
          }),
          expect.objectContaining({
            noteId,
            type: 'updated',
          }),
          expect.objectContaining({
            noteId,
            type: 'created',
          }),
        ],
      },
    });

    const deletedEvent = (
      eventsResponse.json() as {
        _embedded: {
          noteEvents: Array<{ data: { note: { title: string } } }>;
        };
      }
    )._embedded.noteEvents[0];

    expect(deletedEvent.data.note.title).toBe('Tracked Note');
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-note-events-route-'));
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
    await fastify.register(noteEventsRoute, { prefix: '/api' });
    await fastify.ready();

    return fastify;
  }
});
