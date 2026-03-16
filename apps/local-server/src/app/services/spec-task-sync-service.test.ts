import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { ProblemError } from '../errors/problem-error';
import { createNote } from './note-service';
import { createProject } from './project-service';
import { createTask, getTaskById } from './task-service';
import {
  getSpecNoteTaskSyncSnapshot,
  parseSpecTaskBlocks,
  syncSpecNoteToTasks,
} from './spec-task-sync-service';

describe('spec task sync service', () => {
  it('parses routa-style task blocks into task payload fields', () => {
    const blocks = parseSpecTaskBlocks(`
## Goal
Ship the first routa-aligned loop.

@@@task
# Implement spec sync
Create the first spec-to-task sync path.

## Scope
apps/local-server note and task sync modules

## Definition of Done
- Spec notes can be parsed
- Tasks are created idempotently

## Verification
- npx vitest run spec-task-sync-service.test.ts
- npx vitest run mcp.test.ts
@@@
`);

    expect(blocks).toEqual([
      expect.objectContaining({
        acceptanceCriteria: [
          'Spec notes can be parsed',
          'Tasks are created idempotently',
        ],
        index: 0,
        kind: 'implement',
        objective: 'Create the first spec-to-task sync path.',
        scope: 'apps/local-server note and task sync modules',
        title: 'Implement spec sync',
        verificationCommands: [
          'npx vitest run spec-task-sync-service.test.ts',
          'npx vitest run mcp.test.ts',
        ],
      }),
    ]);
  });

  it('rejects unterminated task blocks', () => {
    expect(() =>
      parseSpecTaskBlocks(`
@@@task
# Broken block
Missing closing marker
`),
    ).toThrowError(ProblemError);

    try {
      parseSpecTaskBlocks(`
@@@task
# Broken block
Missing closing marker
`);
    } catch (error) {
      expect(error).toBeInstanceOf(ProblemError);
      expect((error as ProblemError).type).toBe(
        'https://team-ai.dev/problems/spec-task-block-invalid',
      );
    }
  });

  it('reports clean after a spec note has been synchronized', async () => {
    const { cleanup, sqlite } = await createTestDatabase();

    try {
      const note = await createSpecNote(sqlite, validSpecMarkdown);

      const before = getSpecNoteTaskSyncSnapshot(sqlite, note);
      expect(before).toMatchObject({
        matchedCount: 0,
        parsedCount: 1,
        pendingCount: 1,
        status: 'pending_sync',
      });

      const syncResult = await syncSpecNoteToTasks(sqlite, note);
      expect(syncResult).toMatchObject({
        createdCount: 1,
        deletedCount: 0,
        parsedCount: 1,
      });

      expect(getSpecNoteTaskSyncSnapshot(sqlite, note)).toMatchObject({
        conflictCount: 0,
        matchedCount: 1,
        parsedCount: 1,
        pendingCount: 0,
        status: 'clean',
        taskCount: 1,
      });
    } finally {
      await cleanup();
    }
  });

  it('reports parse errors without raising when spec content is malformed', async () => {
    const { cleanup, sqlite } = await createTestDatabase();

    try {
      const note = await createSpecNote(
        sqlite,
        `
@@@task
# Broken block
Missing closing marker
`,
      );

      expect(getSpecNoteTaskSyncSnapshot(sqlite, note)).toMatchObject({
        parseError: 'Task block 1 is missing a closing "@@@" marker',
        status: 'parse_error',
      });
    } finally {
      await cleanup();
    }
  });

  it('reports conflicts when a spec-derived task can no longer be safely rewritten', async () => {
    const { cleanup, sqlite } = await createTestDatabase();

    try {
      const note = await createSpecNote(sqlite, validSpecMarkdown);
      const synced = await syncSpecNoteToTasks(sqlite, note);
      const taskId = synced.tasks[0]?.taskId;

      expect(taskId).toBeTruthy();

      await createTask(sqlite, {
        objective: 'out-of-band task',
        projectId: note.projectId,
        sourceEntryIndex: 99,
        sourceEventId: note.id,
        sourceType: 'spec_note',
        title: 'Orphaned spec task',
      });

      await createTask(sqlite, {
        objective: 'duplicate task body',
        projectId: note.projectId,
        sourceEntryIndex: 0,
        sourceEventId: note.id,
        sourceType: 'spec_note',
        title: 'Duplicate spec task',
      });

      expect(getSpecNoteTaskSyncSnapshot(sqlite, note)).toMatchObject({
        conflictCount: 1,
        orphanedTaskCount: 1,
        pendingCount: 2,
        status: 'conflict',
      });
    } finally {
      await cleanup();
    }
  });

  it('deletes orphaned mutable spec tasks when blocks are removed from the spec', async () => {
    const { cleanup, sqlite } = await createTestDatabase();

    try {
      const note = await createSpecNote(
        sqlite,
        `
## Goal
Ship the first routa-aligned loop.

@@@task
# Implement spec sync
Create the first spec-to-task sync path.

## Definition of Done
- Sync exists
@@@

@@@task
# Verify spec sync
Check the synced task shape.

## Definition of Done
- Verification evidence exists
@@@
`,
      );

      const initialSync = await syncSpecNoteToTasks(sqlite, note);
      const removedTaskId = initialSync.tasks[1]?.taskId;

      expect(initialSync).toMatchObject({
        createdCount: 2,
        deletedCount: 0,
      });

      const updatedNote = {
        ...note,
        content: `
## Goal
Ship the first routa-aligned loop.

@@@task
# Implement spec sync
Create the first spec-to-task sync path.

## Definition of Done
- Sync exists
@@@
`,
      };

      await expect(getTaskById(sqlite, removedTaskId)).resolves.toMatchObject({
        title: 'Verify spec sync',
      });

      const secondSync = await syncSpecNoteToTasks(sqlite, updatedNote);

      expect(secondSync).toMatchObject({
        createdCount: 0,
        deletedCount: 1,
        parsedCount: 1,
      });
      expect(secondSync.tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'deleted',
            reason: 'BLOCK_REMOVED',
            taskId: removedTaskId,
          }),
        ]),
      );

      await expect(getTaskById(sqlite, removedTaskId)).rejects.toBeInstanceOf(
        ProblemError,
      );
    } finally {
      await cleanup();
    }
  });
});

const validSpecMarkdown = `
## Goal
Ship the first routa-aligned loop.

@@@task
# Implement spec sync
Create the first spec-to-task sync path.

## Scope
apps/local-server note and task sync modules

## Definition of Done
- Spec notes can be parsed
- Tasks are created idempotently

## Verification
- npx vitest run spec-task-sync-service.test.ts
- npx vitest run mcp.test.ts
@@@
`;

async function createTestDatabase(): Promise<{
  cleanup: () => Promise<void>;
  sqlite: Database;
}> {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-spec-sync-'));
  const previousDataDir = process.env.TEAMAI_DATA_DIR;

  process.env.TEAMAI_DATA_DIR = dataDir;
  const sqlite = initializeDatabase();

  return {
    cleanup: async () => {
      sqlite.close();
      if (previousDataDir === undefined) {
        delete process.env.TEAMAI_DATA_DIR;
      } else {
        process.env.TEAMAI_DATA_DIR = previousDataDir;
      }
      await rm(dataDir, { force: true, recursive: true });
    },
    sqlite,
  };
}

async function createSpecNote(sqlite: Database, content: string) {
  const project = await createProject(sqlite, {
    repoPath: '/tmp/team-ai-spec-sync',
    title: 'Spec Sync Project',
  });

  return createNote(sqlite, {
    content,
    projectId: project.id,
    sessionId: null,
    title: 'Spec',
    type: 'spec',
  });
}
