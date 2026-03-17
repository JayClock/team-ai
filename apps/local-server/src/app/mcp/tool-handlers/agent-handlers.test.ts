import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../../db/sqlite';
import { createProject } from '../../services/project-service';
import { getTaskById, updateTask } from '../../services/task-service';
import { insertAcpSession } from '../../test-support/acp-session-fixture';
import { createTask } from '../../services/task-service';
import { createDelegateTaskToAgentHandler } from './agent-handlers';

describe('createDelegateTaskToAgentHandler', () => {
  it('returns structured group, wave, and parent resume metadata for after_all delegation', async () => {
    const { cleanup, sqlite } = await createTestDatabase();

    try {
      const project = await createProject(sqlite, {
        repoPath: '/tmp/team-ai-agent-handler-after-all',
        title: 'Agent Handler After All',
      });
      const callerSessionId = 'acps_delegate_handler_parent';

      insertAcpSession(sqlite, {
        cwd: '/tmp/team-ai-agent-handler-after-all',
        id: callerSessionId,
        projectId: project.id,
        provider: 'codex',
      });

      const task = await createTask(sqlite, {
        kind: 'implement',
        objective: 'Delegate a scoped implementation task',
        projectId: project.id,
        sessionId: callerSessionId,
        status: 'PENDING',
        title: 'Delegate implement task',
      });

      const handler = createDelegateTaskToAgentHandler(
        createFastifyStub(sqlite),
      );
      const result = await handler({
        callerSessionId,
        projectId: project.id,
        specialist: 'CRAFTER',
        taskId: task.id,
        waitMode: 'after_all',
      });

      expect(result).toMatchObject({
        delegation: {
          delegationGroupId: expect.any(String),
          groupId: expect.any(String),
          parentWillResumeWhen: {
            condition: 'after_delegation_group_settled',
            groupId: expect.any(String),
            pendingTaskCount: 1,
            taskIds: [task.id],
            waitMode: 'after_all',
          },
          requestedSpecialist: 'CRAFTER',
          resolvedRole: 'CRAFTER',
          resolvedSpecialist: {
            id: 'crafter-implementor',
            name: 'Crafter Implementor',
          },
          waitMode: 'after_all',
          waveState: {
            completedCount: 0,
            failureCount: 0,
            groupId: expect.any(String),
            pendingCount: 1,
            settled: false,
            status: 'RUNNING',
            taskIds: [task.id],
            totalCount: 1,
            waveId: expect.any(String),
            waveKind: 'implement',
          },
        },
        task: {
          id: task.id,
          assignedRole: 'CRAFTER',
          assignedSpecialistId: 'crafter-implementor',
          status: 'READY',
        },
      });
    } finally {
      await cleanup();
    }
  });

  it('keeps immediate delegation responses backward compatible while exposing resume timing', async () => {
    const { cleanup, sqlite } = await createTestDatabase();

    try {
      const project = await createProject(sqlite, {
        repoPath: '/tmp/team-ai-agent-handler-immediate',
        title: 'Agent Handler Immediate',
      });
      const callerSessionId = 'acps_delegate_handler_immediate_parent';

      insertAcpSession(sqlite, {
        cwd: '/tmp/team-ai-agent-handler-immediate',
        id: callerSessionId,
        projectId: project.id,
        provider: 'codex',
      });

      const task = await createTask(sqlite, {
        kind: 'review',
        objective: 'Delegate a gate verification step',
        projectId: project.id,
        sessionId: callerSessionId,
        status: 'PENDING',
        title: 'Delegate gate task',
      });

      const handler = createDelegateTaskToAgentHandler(
        createFastifyStub(sqlite),
      );
      const result = await handler({
        callerSessionId,
        projectId: project.id,
        specialist: 'GATE',
        taskId: task.id,
        waitMode: 'immediate',
      });

      expect(result).toMatchObject({
        delegation: {
          delegationGroupId: null,
          groupId: null,
          parentWillResumeWhen: {
            condition: 'after_child_session_report',
            groupId: null,
            pendingTaskCount: 1,
            taskIds: [task.id],
            waitMode: 'immediate',
          },
          requestedSpecialist: 'GATE',
          resolvedRole: 'GATE',
          waitMode: 'immediate',
          waveState: {
            completedCount: 0,
            failureCount: 0,
            groupId: null,
            pendingCount: 1,
            settled: false,
            status: null,
            taskIds: [task.id],
            totalCount: 1,
            waveId: null,
            waveKind: 'gate',
          },
        },
        task: {
          id: task.id,
          assignedRole: 'GATE',
          assignedSpecialistId: 'gate-reviewer',
          status: 'READY',
        },
      });
    } finally {
      await cleanup();
    }
  });
});

function createFastifyStub(sqlite: Database) {
  return {
    hasDecorator: vi.fn((name: string) => name === 'taskWorkflowOrchestrator'),
    log: {
      child: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      info: vi.fn(),
      trace: vi.fn(),
      warn: vi.fn(),
    } as unknown as FastifyBaseLogger,
    sqlite,
    taskWorkflowOrchestrator: {
      patchTaskFromMcpAndMaybeExecute: vi.fn(
        async (
          taskId: string,
          patch: {
            assignedProvider?: string | null;
            assignedRole?: string | null;
            assignedSpecialistId?: string | null;
            parallelGroup?: string | null;
            status?: string;
          },
        ) => {
          await updateTask(sqlite, taskId, {
            assignedProvider: patch.assignedProvider,
            assignedRole: patch.assignedRole,
            assignedSpecialistId: patch.assignedSpecialistId,
            parallelGroup: patch.parallelGroup,
            status: patch.status,
          });

          return await getTaskById(sqlite, taskId);
        },
      ),
    },
  } as unknown as FastifyInstance;
}

async function createTestDatabase(): Promise<{
  cleanup: () => Promise<void>;
  sqlite: Database;
}> {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-agent-handlers-'));
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
