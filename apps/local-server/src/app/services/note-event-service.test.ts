import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createNote } from './note-service';
import {
  getNoteEventStreamBroker,
  listNoteEventsSince,
  recordNoteEvent,
} from './note-event-service';
import { createProject } from './project-service';

describe('note event service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('publishes note events to subscribers and lists catch-up history after a cursor', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-note-event-service',
      title: 'Note Event Service',
    });
    const note = await createNote(sqlite, {
      content: 'Initial',
      projectId: project.id,
      title: 'Spec',
      type: 'spec',
    });
    const listener = vi.fn();
    const unsubscribe = getNoteEventStreamBroker().subscribe(
      {
        projectId: project.id,
      },
      listener,
    );

    const created = await recordNoteEvent(sqlite, {
      note,
      type: 'created',
    });
    const updated = await recordNoteEvent(sqlite, {
      note: {
        ...note,
        content: 'Updated',
        updatedAt: new Date().toISOString(),
      },
      type: 'updated',
    });

    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: created.eventId,
        type: 'created',
      }),
    );
    await expect(
      listNoteEventsSince(sqlite, {
        projectId: project.id,
        sinceEventId: created.eventId,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        eventId: updated.eventId,
        type: 'updated',
      }),
    ]);
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-note-event-service-'));
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
