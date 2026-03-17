import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../../db/sqlite';
import type { AcpRuntimeClient } from '../../clients/acp-runtime-client';
import type { AcpStreamBroker } from '../../plugins/acp-stream';
import { insertAcpSession } from '../../test-support/acp-session-fixture';
import { readAgentConversation } from '../../services/acp-conversation-service';
import { createProject } from '../../services/project-service';
import { createTask, updateTask } from '../../services/task-service';
import { startTaskRun } from '../../services/task-run-service';
import { createReportToParentHandler } from './task-handlers';

describe('createReportToParentHandler', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('records child completion orchestration events and deduplicates parent wake prompts', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-task-handler-report',
      title: 'Task Handler Report',
    });
    const parentSessionId = 'acps_handler_parent';
    const childSessionId = 'acps_handler_child';

    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-handler-report',
      id: parentSessionId,
      projectId: project.id,
      provider: 'codex',
    });
    const implementationTask = await createTask(sqlite, {
      kind: 'implement',
      objective: 'Implement the scoped report flow',
      projectId: project.id,
      sessionId: parentSessionId,
      status: 'READY',
      title: 'Implement report flow',
    });
    const gateTask = await createTask(sqlite, {
      dependencies: [implementationTask.id],
      kind: 'review',
      objective: 'Review the scoped report flow',
      projectId: project.id,
      sessionId: parentSessionId,
      status: 'PENDING',
      title: 'Review report flow',
    });

    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-handler-report',
      id: childSessionId,
      parentSessionId,
      projectId: project.id,
      provider: 'codex',
      taskId: implementationTask.id,
    });
    await updateTask(sqlite, implementationTask.id, {
      assignedRole: 'CRAFTER',
      executionSessionId: childSessionId,
      status: 'RUNNING',
    });
    await startTaskRun(sqlite, {
      projectId: project.id,
      role: 'CRAFTER',
      sessionId: childSessionId,
      status: 'RUNNING',
      taskId: implementationTask.id,
    });

    const promptSession = vi.fn(async () => ({
      response: { stopReason: 'end_turn' as const },
      runtimeSessionId: 'runtime-report',
    }));
    const executeTask = vi.fn(async () => ({
      dispatch: {
        attempted: true,
        errorMessage: null,
        result: {
          dispatchability: {
            dispatchable: true,
            reasons: [],
            resolvedRole: 'GATE' as const,
            task: await updateTask(sqlite, gateTask.id, {
              assignedRole: 'GATE',
              status: 'READY',
            }),
            unresolvedDependencyIds: [],
          },
          dispatched: true,
          prompt: 'Review report flow',
          provider: 'codex',
          reason: null,
          role: 'GATE' as const,
          sessionId: 'acps_gate_auto',
          specialistId: 'gate-reviewer',
          task: await updateTask(sqlite, gateTask.id, {
            assignedRole: 'GATE',
            status: 'READY',
          }),
        },
      },
      task: await updateTask(sqlite, gateTask.id, {
        assignedRole: 'GATE',
        status: 'READY',
      }),
    }));

    const handler = createReportToParentHandler(
      {
        acpRuntime: {
          isSessionActive: vi.fn(() => true),
          promptSession,
        } as Pick<AcpRuntimeClient, 'isSessionActive' | 'promptSession'>,
        acpStreamBroker: {
          publish: vi.fn(),
        } as unknown as AcpStreamBroker,
        log: {
          error: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
        } as unknown as FastifyBaseLogger,
        sqlite,
        taskWorkflowOrchestrator: {
          executeTask,
        },
      } as FastifyInstance,
    );

    const firstResult = await handler({
      projectId: project.id,
      sessionId: childSessionId,
      summary: 'Implemented the downstream report flow',
      verdict: 'completed',
    });

    expect(firstResult).toMatchObject({
      autoHandoff: [
        expect.objectContaining({
          dispatched: true,
          taskId: gateTask.id,
        }),
      ],
      wake: {
        delivered: true,
        mode: 'immediate',
        reason: null,
      },
    });
    expect(promptSession).toHaveBeenCalledTimes(1);

    const parentConversation = await readAgentConversation(sqlite, {
      projectId: project.id,
      sessionId: parentSessionId,
    });
    const childConversation = await readAgentConversation(sqlite, {
      projectId: project.id,
      sessionId: childSessionId,
    });

    expect(parentConversation.projection.orchestrationEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventName: 'gate_required',
          parentSessionId,
          taskId: implementationTask.id,
          taskIds: [gateTask.id],
        }),
        expect.objectContaining({
          eventName: 'parent_session_resume_requested',
          parentSessionId,
          taskId: implementationTask.id,
          wakeDelivered: true,
        }),
      ]),
    );
    expect(childConversation.projection.orchestrationEvents).toEqual([
      expect.objectContaining({
        childSessionId,
        eventName: 'child_session_completed',
        parentSessionId,
        taskId: implementationTask.id,
      }),
    ]);

    const duplicateResult = await handler({
      projectId: project.id,
      sessionId: childSessionId,
      summary: 'Implemented the downstream report flow again',
      verdict: 'completed',
    });

    expect(duplicateResult.wake).toMatchObject({
      delivered: false,
      mode: 'immediate',
      reason: 'resume_already_requested',
    });
    expect(promptSession).toHaveBeenCalledTimes(1);
  });
});

async function createTestDatabase(cleanupTasks: Array<() => Promise<void>>): Promise<Database> {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-task-handler-'));
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
