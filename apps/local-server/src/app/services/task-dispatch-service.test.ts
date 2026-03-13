import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createProject } from './project-service';
import { updateProjectRuntimeProfile } from './project-runtime-profile-service';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import { createTask, getTaskById } from './task-service';
import {
  dispatchTask,
  dispatchTasks,
  resetTaskDispatchClaimsForTest,
} from './task-dispatch-service';

describe('task dispatch service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    resetTaskDispatchClaimsForTest();

    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('scans a project/session scope and dispatches child sessions with resolved defaults', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Dispatch Service Project',
      repoPath: '/Users/example/dispatch-service-project',
    });

    insertAcpSession(sqlite, {
      actorId: 'desktop-user',
      cwd: '/Users/example/dispatch-service-project',
      id: 'acps_dispatch_parent',
      projectId: project.id,
      provider: 'opencode',
    });
    insertAcpSession(sqlite, {
      actorId: 'desktop-user',
      cwd: '/Users/example/dispatch-service-project',
      id: 'acps_other_parent',
      projectId: project.id,
      provider: 'codex',
    });

    const inScopeTask = await createTask(sqlite, {
      acceptanceCriteria: ['Expose a deterministic dispatch entry point'],
      objective: 'Implement the deterministic dispatch service',
      projectId: project.id,
      status: 'READY',
      title: 'Implement dispatch service',
      triggerSessionId: 'acps_dispatch_parent',
      verificationCommands: ['pnpm vitest task-dispatch-service'],
    });
    await createTask(sqlite, {
      objective: 'Stay outside the requested dispatch scope',
      projectId: project.id,
      status: 'READY',
      title: 'Other session task',
      triggerSessionId: 'acps_other_parent',
    });

    const createSession = vi.fn(async () => ({
      id: 'acps_dispatch_child',
    }));
    const promptSession = vi.fn(async () => undefined);

    const result = await dispatchTasks(
      sqlite,
      {
        createSession,
        promptSession,
      },
      {
        projectId: project.id,
        sessionId: 'acps_dispatch_parent',
      },
    );
    const updatedTask = await getTaskById(sqlite, inScopeTask.id);

    expect(result.dispatchedCount).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      dispatched: true,
      provider: 'opencode',
      role: 'CRAFTER',
      sessionId: 'acps_dispatch_child',
      specialistId: 'crafter-implementor',
      task: {
        id: inScopeTask.id,
      },
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'desktop-user',
        parentSessionId: 'acps_dispatch_parent',
        projectId: project.id,
        provider: 'opencode',
        role: 'CRAFTER',
        specialistId: 'crafter-implementor',
        taskId: inScopeTask.id,
      }),
    );
    expect(promptSession).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        sessionId: 'acps_dispatch_child',
      }),
    );
    expect(updatedTask).toMatchObject({
      assignedProvider: 'opencode',
      assignedRole: 'CRAFTER',
      assignedSpecialistId: 'crafter-implementor',
      assignedSpecialistName: 'Crafter Implementor',
    });
    expect(result.results[0].prompt).toContain('Acceptance Criteria');
  });

  it('prevents duplicate concurrent dispatch attempts for the same task', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Duplicate Dispatch Project',
      repoPath: '/Users/example/duplicate-dispatch',
    });

    insertAcpSession(sqlite, {
      actorId: 'desktop-user',
      cwd: '/Users/example/duplicate-dispatch',
      id: 'acps_duplicate_parent',
      projectId: project.id,
      provider: 'codex',
    });

    const task = await createTask(sqlite, {
      objective: 'Dispatch once only',
      projectId: project.id,
      status: 'READY',
      title: 'Single dispatch task',
      triggerSessionId: 'acps_duplicate_parent',
    });

    let releaseCreateSession: ((value: { id: string }) => void) | undefined;
    const createSession = vi.fn(
      () =>
        new Promise<{ id: string }>((resolve) => {
          releaseCreateSession = resolve;
        }),
    );
    const promptSession = vi.fn(async () => undefined);

    const firstDispatch = dispatchTask(
      sqlite,
      {
        createSession,
        promptSession,
      },
      {
        taskId: task.id,
      },
    );

    await vi.waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
    });

    const secondDispatch = await dispatchTask(
      sqlite,
      {
        createSession,
        promptSession,
      },
      {
        taskId: task.id,
      },
    );

    expect(secondDispatch).toMatchObject({
      dispatched: false,
      reason: 'TASK_ALREADY_DISPATCHING',
      sessionId: null,
    });

    if (!releaseCreateSession) {
      throw new Error('Expected createSession to be waiting for resolution');
    }

    releaseCreateSession({
      id: 'acps_duplicate_child',
    });

    const firstResult = await firstDispatch;

    expect(firstResult).toMatchObject({
      dispatched: true,
      reason: null,
      sessionId: 'acps_duplicate_child',
    });
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(promptSession).toHaveBeenCalledTimes(1);
  });

  it('falls back to the next available provider when the preferred provider is unavailable', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Dispatch Provider Fallback Project',
      repoPath: '/Users/example/dispatch-provider-fallback',
    });

    insertAcpSession(sqlite, {
      actorId: 'desktop-user',
      cwd: '/Users/example/dispatch-provider-fallback',
      id: 'acps_provider_fallback_parent',
      projectId: project.id,
      provider: 'codex',
    });

    const task = await createTask(sqlite, {
      assignedProvider: 'opencode',
      objective:
        'Use the next available provider when the preferred one is down',
      projectId: project.id,
      status: 'READY',
      title: 'Fallback provider task',
      triggerSessionId: 'acps_provider_fallback_parent',
    });

    const createSession = vi.fn(async () => ({
      id: 'acps_provider_fallback_child',
    }));
    const promptSession = vi.fn(async () => undefined);

    const result = await dispatchTask(
      sqlite,
      {
        createSession,
        isProviderAvailable: vi.fn(
          async (provider: string) => provider === 'codex',
        ),
        promptSession,
      },
      {
        taskId: task.id,
      },
    );

    const updatedTask = await getTaskById(sqlite, task.id);

    expect(result).toMatchObject({
      dispatched: true,
      provider: 'codex',
      sessionId: 'acps_provider_fallback_child',
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'codex',
      }),
    );
    expect(updatedTask.assignedProvider).toBe('codex');
  });

  it('moves tasks to waiting retry when no configured provider is available', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Dispatch Provider Exhausted Project',
      repoPath: '/Users/example/dispatch-provider-exhausted',
    });

    insertAcpSession(sqlite, {
      actorId: 'desktop-user',
      cwd: '/Users/example/dispatch-provider-exhausted',
      id: 'acps_provider_exhausted_parent',
      projectId: project.id,
      provider: 'opencode',
    });

    const task = await createTask(sqlite, {
      assignedProvider: 'opencode',
      objective: 'Pause execution until a provider becomes available again',
      projectId: project.id,
      status: 'READY',
      title: 'Unavailable provider task',
      triggerSessionId: 'acps_provider_exhausted_parent',
    });

    await expect(
      dispatchTask(
        sqlite,
        {
          createSession: vi.fn(async () => ({
            id: 'acps_unreachable_child',
          })),
          isProviderAvailable: vi.fn(async () => false),
          promptSession: vi.fn(async () => undefined),
        },
        {
          taskId: task.id,
        },
      ),
    ).rejects.toMatchObject({
      status: 503,
      type: 'https://team-ai.dev/problems/task-dispatch-provider-unavailable',
    });

    const updatedTask = await getTaskById(sqlite, task.id);

    expect(updatedTask).toMatchObject({
      completionSummary: expect.stringContaining(
        'no configured ACP provider is available',
      ),
      executionSessionId: null,
      resultSessionId: null,
      status: 'WAITING_RETRY',
      verificationReport: expect.stringContaining('Tried: opencode, codex'),
      verificationVerdict: 'fail',
    });
  });

  it('moves tasks to waiting retry when child session creation fails', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Dispatch Child Session Failure Project',
      repoPath: '/Users/example/dispatch-child-session-failure',
    });

    insertAcpSession(sqlite, {
      actorId: 'desktop-user',
      cwd: '/Users/example/dispatch-child-session-failure',
      id: 'acps_child_failure_parent',
      projectId: project.id,
      provider: 'codex',
    });

    const task = await createTask(sqlite, {
      objective: 'Recover cleanly from child session creation failures',
      projectId: project.id,
      status: 'READY',
      title: 'Child session failure task',
      triggerSessionId: 'acps_child_failure_parent',
    });

    await expect(
      dispatchTask(
        sqlite,
        {
          createSession: vi.fn(async () => {
            throw new Error('Child session bootstrap failed');
          }),
          promptSession: vi.fn(async () => undefined),
        },
        {
          taskId: task.id,
        },
      ),
    ).rejects.toThrow('Child session bootstrap failed');

    const updatedTask = await getTaskById(sqlite, task.id);

    expect(updatedTask).toMatchObject({
      completionSummary: 'Child session bootstrap failed',
      executionSessionId: null,
      resultSessionId: null,
      status: 'WAITING_RETRY',
      verificationReport: 'Child session bootstrap failed',
      verificationVerdict: 'fail',
    });
  });

  it('keeps solo developer mode tasks in the current session by default', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Developer Dispatch Project',
      repoPath: '/Users/example/developer-dispatch',
    });

    await updateProjectRuntimeProfile(sqlite, project.id, {
      orchestrationMode: 'DEVELOPER',
    });

    insertAcpSession(sqlite, {
      actorId: 'desktop-user',
      cwd: '/Users/example/developer-dispatch',
      id: 'acps_developer_parent',
      projectId: project.id,
      provider: 'codex',
    });

    const task = await createTask(sqlite, {
      objective: 'Stay inside the current solo session',
      projectId: project.id,
      status: 'READY',
      title: 'Solo mode task',
      triggerSessionId: 'acps_developer_parent',
    });
    const createSession = vi.fn(async () => ({
      id: 'acps_should_not_exist',
    }));
    const promptSession = vi.fn(async () => undefined);

    const result = await dispatchTask(
      sqlite,
      {
        createSession,
        promptSession,
      },
      {
        taskId: task.id,
      },
    );

    expect(result).toMatchObject({
      dispatched: false,
      reason: 'TASK_NOT_DISPATCHABLE',
      role: 'DEVELOPER',
      sessionId: null,
      specialistId: null,
    });
    expect(result.dispatchability.reasons).toContain(
      'TASK_DEVELOPER_MODE_STAYS_IN_SESSION',
    );
    expect(createSession).not.toHaveBeenCalled();
    expect(promptSession).not.toHaveBeenCalled();
  });

  it('emits structured diagnostics for dispatch success and blocked outcomes', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Dispatch Diagnostics Project',
      repoPath: '/Users/example/dispatch-diagnostics',
    });

    insertAcpSession(sqlite, {
      actorId: 'desktop-user',
      cwd: '/Users/example/dispatch-diagnostics',
      id: 'acps_dispatch_diagnostics_parent',
      projectId: project.id,
      provider: 'codex',
    });

    const readyTask = await createTask(sqlite, {
      objective: 'Emit success diagnostics for dispatch',
      projectId: project.id,
      status: 'READY',
      title: 'Dispatch diagnostics success',
      triggerSessionId: 'acps_dispatch_diagnostics_parent',
    });
    const completedTask = await createTask(sqlite, {
      objective: 'Emit blocked diagnostics for dispatch',
      projectId: project.id,
      status: 'COMPLETED',
      title: 'Dispatch diagnostics blocked',
      triggerSessionId: 'acps_dispatch_diagnostics_parent',
    });

    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };

    await dispatchTask(
      sqlite,
      {
        createSession: vi.fn(async () => ({
          id: 'acps_dispatch_diagnostics_child',
        })),
        promptSession: vi.fn(async () => undefined),
      },
      {
        taskId: readyTask.id,
      },
      {
        logger,
        source: 'task_execute',
        triggerSource: 'manual',
      },
    );

    await dispatchTask(
      sqlite,
      {
        createSession: vi.fn(async () => ({
          id: 'acps_dispatch_diagnostics_child_blocked',
        })),
        promptSession: vi.fn(async () => undefined),
      },
      {
        taskId: completedTask.id,
      },
      {
        logger,
        source: 'task_execute',
        triggerSource: 'manual',
      },
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'task.dispatch.attempt',
        projectId: project.id,
        source: 'task_execute',
        taskId: readyTask.id,
        taskKind: 'implement',
        taskStatus: 'READY',
        triggerSource: 'manual',
      }),
      'Dispatching task to a child ACP session',
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'task.dispatch.succeeded',
        projectId: project.id,
        sessionId: 'acps_dispatch_diagnostics_child',
        source: 'task_execute',
        taskId: readyTask.id,
      }),
      'Task dispatch completed successfully',
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        blockReasons: ['TASK_STATUS_NOT_DISPATCHABLE'],
        event: 'task.dispatch.blocked',
        projectId: project.id,
        reason: 'TASK_NOT_DISPATCHABLE',
        source: 'task_execute',
        taskId: completedTask.id,
        taskStatus: 'COMPLETED',
      }),
      'Task dispatch blocked by current task state',
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(
      join(tmpdir(), 'team-ai-task-dispatch-service-'),
    );
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
