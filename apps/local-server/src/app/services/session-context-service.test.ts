import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { ensureDefaultKanbanBoard } from './kanban-board-service';
import { listProjectCodebases } from './project-codebase-service';
import { createProject } from './project-service';
import { getAcpSessionContext } from './session-context-service';
import { createTask, updateTask } from './task-service';
import { insertAcpSession } from '../test-support/acp-session-fixture';

describe('session context service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('builds kanban context, related handoffs, and worktree bindings for a session', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-session-context-service',
      title: 'Session Context Service',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const codebase = (await listProjectCodebases(sqlite, project.id)).items[0];
    insertAcpSession(sqlite, {
      id: 'acps_ctx_root',
      name: 'Root Session',
      projectId: project.id,
    });
    insertAcpSession(sqlite, {
      id: 'acps_ctx_prev',
      name: 'Previous Lane Session',
      projectId: project.id,
    });
    insertAcpSession(sqlite, {
      id: 'acps_ctx_current',
      name: 'Current Lane Session',
      projectId: project.id,
    });

    sqlite
      .prepare(
        `
          INSERT INTO project_worktrees (
            id, project_id, codebase_id, worktree_path, branch, base_branch,
            status, session_id, label, error_message, created_at, updated_at, deleted_at
          ) VALUES (
            @id, @projectId, @codebaseId, @worktreePath, @branch, @baseBranch,
            @status, @sessionId, @label, NULL, @createdAt, @updatedAt, NULL
          )
        `,
      )
      .run({
        baseBranch: 'main',
        branch: 'ctx/feature',
        codebaseId: codebase?.id,
        createdAt: '2026-03-17T00:00:00.000Z',
        id: 'wt_ctx_1',
        label: 'Context WT',
        projectId: project.id,
        sessionId: 'acps_ctx_current',
        status: 'active',
        updatedAt: '2026-03-17T00:00:00.000Z',
        worktreePath: '/tmp/team-ai-session-context-service/.worktrees/context',
      });

    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: board.columns[2]?.id ?? null,
      executionSessionId: 'acps_ctx_current',
      laneHandoffs: [
        {
          fromColumnId: board.columns[1]?.id,
          fromSessionId: 'acps_ctx_prev',
          id: 'handoff_ctx_1',
          request: 'Share runtime context for the dev lane',
          requestType: 'runtime_context',
          requestedAt: '2026-03-17T00:01:00.000Z',
          status: 'delivered',
          toColumnId: board.columns[2]?.id,
          toSessionId: 'acps_ctx_current',
        },
      ],
      laneSessions: [
        {
          columnId: board.columns[1]?.id,
          columnName: board.columns[1]?.name,
          provider: 'codex',
          role: 'CRAFTER',
          sessionId: 'acps_ctx_prev',
          startedAt: '2026-03-17T00:00:00.000Z',
          status: 'completed',
        },
        {
          columnId: board.columns[2]?.id,
          columnName: board.columns[2]?.name,
          provider: 'codex',
          role: 'CRAFTER',
          sessionId: 'acps_ctx_current',
          startedAt: '2026-03-17T00:02:00.000Z',
          status: 'running',
        },
      ],
      objective: 'Implement context-aware routing',
      projectId: project.id,
      sessionIds: ['acps_ctx_current'],
      title: 'Context aware routing',
      worktreeId: 'wt_ctx_1',
    });
    await updateTask(sqlite, task.id, {
      triggerSessionId: 'acps_ctx_root',
    });

    sqlite
      .prepare(
        `
          UPDATE project_acp_sessions
          SET task_id = @taskId, worktree_id = @worktreeId
          WHERE id = @sessionId
        `,
      )
      .run({
        sessionId: 'acps_ctx_current',
        taskId: task.id,
        worktreeId: 'wt_ctx_1',
      });

    const context = await getAcpSessionContext(
      sqlite,
      project.id,
      'acps_ctx_current',
    );

    expect(context.session.id).toBe('acps_ctx_current');
    expect(context.task?.id).toBe(task.id);
    expect(context.kanban).toMatchObject({
      boardId: board.id,
      boardName: board.name,
      columnId: board.columns[2]?.id,
      columnName: board.columns[2]?.name,
      taskId: task.id,
      triggerSessionId: 'acps_ctx_root',
      currentLaneSession: expect.objectContaining({
        sessionId: 'acps_ctx_current',
      }),
      previousLaneSession: expect.objectContaining({
        sessionId: 'acps_ctx_prev',
      }),
      relatedHandoffs: [
        expect.objectContaining({
          direction: 'incoming',
          id: 'handoff_ctx_1',
          fromColumnName: board.columns[1]?.name,
          toColumnName: board.columns[2]?.name,
        }),
      ],
    });
    expect(context.worktree).toMatchObject({
      id: 'wt_ctx_1',
      sessionId: 'acps_ctx_current',
      status: 'active',
    });
  });
});

async function createTestDatabase(cleanupTasks: Array<() => Promise<void>>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-session-context-'));
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
