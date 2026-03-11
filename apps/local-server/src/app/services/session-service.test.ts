import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject } from './project-service';
import {
  createSession,
  deleteSession,
  getSessionContext,
  getSessionHistory,
  getSessionById,
  listSessions,
  updateSession,
} from './session-service';
import { initializeDatabase } from '../db/sqlite';

describe('session service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('creates sessions, preserves metadata, and lists by project', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Team AI',
      repoPath: '/Users/example/team-ai',
    });

    const created = await createSession(sqlite, {
      metadata: {
        mode: 'ROUTA',
      },
      projectId: project.id,
      status: 'ACTIVE',
      title: 'Planning session',
    });

    const reloaded = await getSessionById(sqlite, created.id);
    const listed = await listSessions(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
      status: 'ACTIVE',
    });

    expect(reloaded).toMatchObject({
      id: created.id,
      metadata: {
        mode: 'ROUTA',
      },
      projectId: project.id,
      status: 'ACTIVE',
      title: 'Planning session',
    });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.id).toBe(created.id);
  });

  it('builds lineage and context for parent-child sessions', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Workspace',
      repoPath: '/Users/example/workspace',
    });

    const root = await createSession(sqlite, {
      projectId: project.id,
      title: 'Root',
    });
    const sibling = await createSession(sqlite, {
      projectId: project.id,
      title: 'Sibling',
    });
    const child = await createSession(sqlite, {
      parentSessionId: root.id,
      projectId: project.id,
      title: 'Child',
    });
    const cousin = await createSession(sqlite, {
      parentSessionId: root.id,
      projectId: project.id,
      title: 'Cousin',
    });
    const grandchild = await createSession(sqlite, {
      parentSessionId: child.id,
      projectId: project.id,
      title: 'Grandchild',
    });

    const history = await getSessionHistory(sqlite, grandchild.id);
    const context = await getSessionContext(sqlite, child.id);

    expect(history.items.map((session) => session.title)).toEqual([
      'Root',
      'Child',
      'Grandchild',
    ]);
    expect(context.current.id).toBe(child.id);
    expect(context.parent?.id).toBe(root.id);
    expect(context.children.map((session) => session.id)).toContain(grandchild.id);
    expect(context.siblings.map((session) => session.id)).toContain(cousin.id);
    expect(context.siblings.map((session) => session.id)).not.toContain(sibling.id);
    expect(context.recentInWorkspace.map((session) => session.id)).toEqual(
      expect.arrayContaining([root.id, sibling.id, cousin.id, grandchild.id]),
    );
  });

  it('supports detaching a session from its parent', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Detach',
      repoPath: '/Users/example/detach',
    });
    const root = await createSession(sqlite, {
      projectId: project.id,
      title: 'Root',
    });
    const child = await createSession(sqlite, {
      parentSessionId: root.id,
      projectId: project.id,
      title: 'Child',
    });

    const updated = await updateSession(sqlite, child.id, {
      parentSessionId: null,
      status: 'PAUSED',
    });
    const context = await getSessionContext(sqlite, child.id);

    expect(updated.parentSessionId).toBeNull();
    expect(updated.status).toBe('PAUSED');
    expect(context.parent).toBeNull();
  });

  it('rejects cross-project parents and hierarchy cycles', async () => {
    const sqlite = await createTestDatabase();
    const projectA = await createProject(sqlite, {
      title: 'Project A',
      repoPath: '/Users/example/project-a',
    });
    const projectB = await createProject(sqlite, {
      title: 'Project B',
      repoPath: '/Users/example/project-b',
    });

    const root = await createSession(sqlite, {
      projectId: projectA.id,
      title: 'Root',
    });
    const child = await createSession(sqlite, {
      parentSessionId: root.id,
      projectId: projectA.id,
      title: 'Child',
    });
    const grandchild = await createSession(sqlite, {
      parentSessionId: child.id,
      projectId: projectA.id,
      title: 'Grandchild',
    });

    await expect(
      createSession(sqlite, {
        parentSessionId: root.id,
        projectId: projectB.id,
        title: 'Invalid cross-project child',
      }),
    ).rejects.toMatchObject({
      status: 409,
      type: 'https://team-ai.dev/problems/session-parent-project-mismatch',
    });

    await expect(
      updateSession(sqlite, root.id, {
        parentSessionId: grandchild.id,
      }),
    ).rejects.toMatchObject({
      status: 409,
      type: 'https://team-ai.dev/problems/session-hierarchy-cycle',
    });
  });

  it('soft deletes sessions and hides them from reads', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Delete',
      repoPath: '/Users/example/delete',
    });
    const session = await createSession(sqlite, {
      projectId: project.id,
      title: 'Delete me',
    });

    await deleteSession(sqlite, session.id);

    await expect(getSessionById(sqlite, session.id)).rejects.toMatchObject({
      status: 404,
      type: 'https://team-ai.dev/problems/session-not-found',
    });

    const listed = await listSessions(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
    });

    expect(listed.items).toHaveLength(0);
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-session-service-'));
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
