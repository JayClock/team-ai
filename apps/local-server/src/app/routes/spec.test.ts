import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import { createNote, updateNote } from '../services/note-service';
import { createProject } from '../services/project-service';
import { listTasks } from '../services/task-service';
import { responseContentType } from '../test-support/response-content-type';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import specRoute from './spec';

describe('spec route', () => {
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

  it('syncs canonical spec blocks into tasks and reports create update archive counts', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/Users/example/spec-sync',
      title: 'Spec Sync',
    });
    const note = await createNote(sqlite, {
      content: `
## Goal
Ship the spec sync path.

@@@task
# Implement spec sync
Create cards from canonical spec blocks.

## Owner
Todo Orchestrator

## Definition of Done
- Cards are created from spec

## Verification
- pnpm vitest apps/local-server/src/app/routes/spec.test.ts
@@@

@@@task
# Review spec sync
Validate the generated cards.

## Owner
Gate Reviewer

## Depends On
- Implement spec sync

## Verification
- pnpm vitest apps/local-server/src/app/routes/mcp.test.ts
@@@
`,
      projectId: project.id,
      source: 'user',
      title: 'Execution Spec',
      type: 'spec',
    });

    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(specRoute, { prefix: '/api' });
    await fastify.ready();

    const firstResponse = await fastify.inject({
      method: 'POST',
      payload: {
        noteId: note.id,
      },
      url: `/api/projects/${project.id}/spec/sync`,
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(responseContentType(firstResponse)).toBe(VENDOR_MEDIA_TYPES.specTaskSync);
    expect(firstResponse.json()).toMatchObject({
      archivedCount: 0,
      createdCount: 2,
      parsedTaskCount: 2,
      updatedCount: 0,
    });

    const createdTasks = await listTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
    });
    const implementTask = createdTasks.items.find(
      (task) => task.title === 'Implement spec sync',
    );
    expect(createdTasks.total).toBe(2);
    expect(implementTask).toBeTruthy();
    expect(createdTasks.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assignedSpecialistId: 'todo-orchestrator',
          sourceEntryIndex: 0,
          sourceEventId: note.id,
          sourceType: 'spec_note',
          title: 'Implement spec sync',
        }),
        expect.objectContaining({
          assignedSpecialistId: 'gate-reviewer',
          dependencies: implementTask ? [implementTask.id] : [],
          sourceEntryIndex: 1,
          sourceEventId: note.id,
          sourceType: 'spec_note',
          title: 'Review spec sync',
        }),
      ]),
    );

    await updateNote(sqlite, note.id, {
      content: `
## Goal
Ship the spec sync path.

@@@task
# Implement canonical spec sync
Update the existing synced card instead of creating a duplicate.

## Owner
Todo Orchestrator

## Definition of Done
- Cards are updated from spec

## Verification
- pnpm vitest apps/local-server/src/app/routes/spec.test.ts
@@@
`,
    });

    const secondResponse = await fastify.inject({
      method: 'POST',
      payload: {
        noteId: note.id,
      },
      url: `/api/projects/${project.id}/spec/sync`,
    });

    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.json()).toMatchObject({
      archivedCount: 1,
      createdCount: 0,
      parsedTaskCount: 1,
      updatedCount: 1,
    });

    const updatedTasks = await listTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
    });
    expect(updatedTasks.total).toBe(1);
    expect(updatedTasks.items[0]).toMatchObject({
      sourceEntryIndex: 0,
      sourceEventId: note.id,
      sourceType: 'spec_note',
      title: 'Implement canonical spec sync',
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-spec-route-'));
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
