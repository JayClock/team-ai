import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createNote } from './note-service';
import { createProject } from './project-service';
import {
  getSpecNoteTaskSyncSnapshot,
  parseSpecTaskBlocks,
  syncSpecNoteToTasks,
} from './spec-task-sync-service';

describe('spec task sync service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('returns explicit skipped semantics for legacy spec sync calls', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-spec-sync-compat',
      title: 'Spec Sync Compat',
    });
    const note = await createNote(sqlite, {
      content: '## Goal\nKeep spec notes as notes only.',
      projectId: project.id,
      source: 'user',
      title: 'Spec',
      type: 'spec',
    });

    expect(parseSpecTaskBlocks(note.content)).toEqual([]);
    await expect(syncSpecNoteToTasks(sqlite, note)).resolves.toMatchObject({
      createdCount: 0,
      parsedCount: 0,
      skipped: true,
      tasks: [],
      updatedCount: 0,
    });
    expect(getSpecNoteTaskSyncSnapshot(sqlite, note)).toMatchObject({
      noteId: note.id,
      parsedCount: 0,
      pendingCount: 0,
      skipped: true,
      status: 'clean',
      taskCount: 0,
    });
  });
});

async function createTestDatabase(cleanupTasks: Array<() => Promise<void>>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-spec-sync-compat-'));
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
