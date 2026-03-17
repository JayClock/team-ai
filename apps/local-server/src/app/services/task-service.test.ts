import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createProject } from './project-service';
import { listProjectCodebases } from './project-codebase-service';
import {
  failTaskRun,
  MAX_TASK_RUN_RETRY_COUNT,
  startTaskRun,
} from './task-run-service';
import { executeTaskSession } from './task-session-runtime-service';
import {
  getTaskDispatchability,
  listDispatchableTasks,
  resolveDefaultTaskRole,
} from './task-dispatch-policy-service';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import {
  createTask,
  deleteTask,
  getTaskById,
  listTasks,
  updateTask,
  updateTaskFromMcp,
} from './task-service';

const execFileAsync = promisify(execFile);

describe('task service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('creates tasks and still filters them by session context', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Team AI',
      repoPath: '/Users/example/team-ai',
    });
    const session = { id: 'acps_roottasksvc' };
    insertAcpSession(sqlite, {
      cwd: '/Users/example/team-ai',
      id: session.id,
      name: 'Root session',
      projectId: project.id,
    });

    const task = await createTask(sqlite, {
      acceptanceCriteria: ['Expose route'],
      dependencies: [],
      labels: ['backend'],
      objective: 'Add task APIs',
      projectId: project.id,
      status: 'READY',
      title: 'Implement tasks',
      sessionId: session.id,
      verificationCommands: ['npx nx test local-server'],
    });

    const byProject = await listTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
    });
    const bySession = await listTasks(sqlite, {
      page: 1,
      pageSize: 20,
      sessionId: session.id,
    });

    expect(task.acceptanceCriteria).toEqual(['Expose route']);
    expect(task).toMatchObject({
      laneHandoffs: [],
      laneSessions: [],
      sessionId: session.id,
      sessionIds: [session.id],
      triggerSessionId: null,
      workspaceId: project.id,
    });
    expect(byProject.items.map((item) => item.id)).toContain(task.id);
    expect(bySession.items.map((item) => item.id)).toContain(task.id);
  });

  it('binds tasks to codebases and rejects foreign worktree ids', async () => {
    const sqlite = await createTestDatabase();
    const repoPath = await createGitRepository();
    const project = await createProject(sqlite, {
      title: 'Bound Tasks',
      repoPath,
    });
    const [codebase] = (await listProjectCodebases(sqlite, project.id)).items;

    const task = await createTask(sqlite, {
      codebaseId: codebase.id,
      objective: 'Track worktree-backed execution',
      projectId: project.id,
      title: 'Bound task',
    });

    expect(task).toMatchObject({
      codebaseId: codebase.id,
      codebaseIds: [codebase.id],
      worktreeId: null,
    });

    const otherProject = await createProject(sqlite, {
      title: 'Foreign Bound Tasks',
      repoPath: await createGitRepository(),
    });
    const [foreignCodebase] = (
      await listProjectCodebases(sqlite, otherProject.id)
    ).items;

    await expect(
      updateTask(sqlite, task.id, {
        worktreeId: `wt_${foreignCodebase.id}`,
      }),
    ).rejects.toMatchObject({
      status: 404,
      type: 'https://team-ai.dev/problems/worktree-not-found',
    });
  });

  it('updates task assignment and verification fields', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Update Task',
      repoPath: '/Users/example/update-task',
    });

    const task = await createTask(sqlite, {
      objective: 'Initial objective',
      projectId: project.id,
      title: 'Initial task',
    });

    const updated = await updateTask(sqlite, task.id, {
      assignedProvider: 'opencode',
      assignedRole: 'CRAFTER',
      completionSummary: 'Implemented routes',
      dependencies: ['task_prev'],
      status: 'COMPLETED',
      verificationReport: 'All checks passed',
      verificationVerdict: 'pass',
    });

    expect(updated).toMatchObject({
      assignedProvider: 'opencode',
      assignedRole: 'CRAFTER',
      completionSummary: 'Implemented routes',
      dependencies: ['task_prev'],
      status: 'COMPLETED',
      verificationReport: 'All checks passed',
      verificationVerdict: 'pass',
    });
  });

  it('validates task statuses and blocks unsafe MCP status transitions', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Task Status Guards',
      repoPath: '/Users/example/task-status-guards',
    });

    await expect(
      createTask(sqlite, {
        objective: 'Reject unknown status values',
        projectId: project.id,
        status: 'PAUSED',
        title: 'Invalid status task',
      }),
    ).rejects.toMatchObject({
      status: 400,
      type: 'https://team-ai.dev/problems/invalid-task-status',
    });

    const task = await createTask(sqlite, {
      objective: 'Guard manual task status writes',
      projectId: project.id,
      status: 'READY',
      title: 'Writable status task',
    });
    const completedTask = await createTask(sqlite, {
      objective: 'Do not reopen completed work',
      projectId: project.id,
      status: 'COMPLETED',
      title: 'Completed task',
    });

    await expect(
      updateTask(sqlite, task.id, {
        status: 'PAUSED',
      }),
    ).rejects.toMatchObject({
      status: 400,
      type: 'https://team-ai.dev/problems/invalid-task-status',
    });

    const waitingRetry = await updateTaskFromMcp(sqlite, task.id, {
      status: 'WAITING_RETRY',
    });

    expect(waitingRetry.status).toBe('WAITING_RETRY');

    await expect(
      updateTaskFromMcp(sqlite, waitingRetry.id, {
        status: 'RUNNING',
      }),
    ).rejects.toMatchObject({
      status: 409,
      type: 'https://team-ai.dev/problems/task-status-not-mcp-writable',
    });

    await expect(
      updateTaskFromMcp(sqlite, completedTask.id, {
        status: 'READY',
      }),
    ).rejects.toMatchObject({
      status: 409,
      type: 'https://team-ai.dev/problems/task-status-transition-not-allowed',
    });
  });

  it('resolves default dispatch roles by task kind and orchestration mode', () => {
    expect(resolveDefaultTaskRole('implement')).toBe('CRAFTER');
    expect(
      resolveDefaultTaskRole('implement', {
        orchestrationMode: 'DEVELOPER',
      }),
    ).toBe('DEVELOPER');
    expect(
      resolveDefaultTaskRole('review', {
        orchestrationMode: 'DEVELOPER',
      }),
    ).toBe('DEVELOPER');
    expect(
      resolveDefaultTaskRole('verify', {
        orchestrationMode: 'DEVELOPER',
      }),
    ).toBe('DEVELOPER');
    expect(
      resolveDefaultTaskRole('plan', {
        orchestrationMode: 'DEVELOPER',
      }),
    ).toBe('DEVELOPER');
    expect(resolveDefaultTaskRole('review')).toBe('GATE');
    expect(resolveDefaultTaskRole('verify')).toBe('GATE');
    expect(resolveDefaultTaskRole('plan')).toBe('ROUTA');
    expect(resolveDefaultTaskRole(null)).toBeNull();
  });

  it('keeps default developer-mode tasks in the current session unless a downstream role is explicit', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Developer Mode Dispatchability',
      repoPath: '/Users/example/developer-mode-dispatchability',
    });
    const rootSessionId = 'acps_devmode_root';

    insertAcpSession(sqlite, {
      cwd: '/Users/example/developer-mode-dispatchability',
      id: rootSessionId,
      projectId: project.id,
      provider: 'codex',
    });

    const defaultTask = await createTask(sqlite, {
      objective: 'Handle this in the current solo session',
      projectId: project.id,
      status: 'READY',
      title: 'Solo implement task',
      sessionId: rootSessionId,
    });
    const delegatedTask = await createTask(sqlite, {
      assignedRole: 'CRAFTER',
      objective: 'Delegate this to a downstream specialist',
      projectId: project.id,
      status: 'READY',
      title: 'Delegated implement task',
      sessionId: rootSessionId,
    });

    const defaultDispatchability = await getTaskDispatchability(
      sqlite,
      defaultTask.id,
      {
        orchestrationMode: 'DEVELOPER',
      },
    );
    const delegatedDispatchability = await getTaskDispatchability(
      sqlite,
      delegatedTask.id,
      {
        orchestrationMode: 'DEVELOPER',
      },
    );

    expect(defaultDispatchability).toMatchObject({
      dispatchable: false,
      resolvedRole: 'DEVELOPER',
    });
    expect(defaultDispatchability.reasons).toContain(
      'TASK_DEVELOPER_MODE_STAYS_IN_SESSION',
    );
    expect(delegatedDispatchability).toMatchObject({
      dispatchable: true,
      resolvedRole: 'CRAFTER',
    });
  });

  it('evaluates task dispatchability using status, execution session, and dependencies', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Dispatchability Project',
      repoPath: '/Users/example/dispatchability-project',
    });
    const rootSessionId = 'acps_dispatch_root';
    insertAcpSession(sqlite, {
      cwd: '/Users/example/dispatchability-project',
      id: rootSessionId,
      projectId: project.id,
      provider: 'opencode',
    });

    const dependency = await createTask(sqlite, {
      objective: 'Finish dependency first',
      projectId: project.id,
      status: 'PENDING',
      title: 'Dependency task',
      sessionId: rootSessionId,
    });
    const task = await createTask(sqlite, {
      dependencies: [dependency.id],
      objective: 'Implement the dispatch flow',
      projectId: project.id,
      status: 'READY',
      title: 'Dispatchable task',
      sessionId: rootSessionId,
    });
    const runningTask = await createTask(sqlite, {
      executionSessionId: rootSessionId,
      objective: 'Already executing somewhere else',
      projectId: project.id,
      status: 'RUNNING',
      title: 'Running task',
      sessionId: rootSessionId,
    });
    await createTask(sqlite, {
      objective: 'Manual task without context',
      projectId: project.id,
      status: 'READY',
      title: 'Detached task',
    });

    const blocked = await getTaskDispatchability(sqlite, task.id);

    expect(blocked).toMatchObject({
      dispatchable: false,
      resolvedRole: 'CRAFTER',
      unresolvedDependencyIds: [dependency.id],
    });
    expect(blocked.reasons).toContain('TASK_DEPENDENCIES_INCOMPLETE');

    const running = await getTaskDispatchability(sqlite, runningTask.id);
    expect(running.dispatchable).toBe(false);
    expect(running.reasons).toContain('TASK_EXECUTION_ALREADY_ACTIVE');

    await updateTask(sqlite, dependency.id, {
      status: 'COMPLETED',
    });

    const ready = await getTaskDispatchability(sqlite, task.id);
    const dispatchableTasks = await listDispatchableTasks(sqlite, {
      projectId: project.id,
    });

    expect(ready).toMatchObject({
      dispatchable: true,
      reasons: [],
      resolvedRole: 'CRAFTER',
      unresolvedDependencyIds: [],
    });
    expect(dispatchableTasks.map((item) => item.task.id)).toEqual(
      expect.arrayContaining([task.id]),
    );
    expect(dispatchableTasks).toHaveLength(2);
  });

  it('updates task status without dispatching child ACP sessions', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Task Update Dispatch Project',
      repoPath: '/Users/example/task-update-dispatch',
    });
    const rootSessionId = 'acps_update_dispatch_root';
    insertAcpSession(sqlite, {
      cwd: '/Users/example/task-update-dispatch',
      id: rootSessionId,
      projectId: project.id,
      provider: 'codex',
    });

    const queuedTask = await createTask(sqlite, {
      objective: 'Become ready after dependency resolution',
      projectId: project.id,
      status: 'PENDING',
      title: 'Queued task',
      sessionId: rootSessionId,
    });
    const retryTask = await createTask(sqlite, {
      objective: 'Retry after a failed attempt',
      projectId: project.id,
      status: 'FAILED',
      title: 'Retry task',
      sessionId: rootSessionId,
    });
    const completedTask = await createTask(sqlite, {
      objective: 'Finish without dispatch',
      projectId: project.id,
      status: 'PENDING',
      title: 'Completed task',
      sessionId: rootSessionId,
    });

    const automaticReady = await updateTask(sqlite, queuedTask.id, {
      status: 'READY',
    });
    const manualRetry = await updateTask(sqlite, retryTask.id, {
      status: 'READY',
    });
    const completed = await updateTask(sqlite, completedTask.id, {
      status: 'COMPLETED',
    });

    expect(automaticReady.status).toBe('READY');
    expect(automaticReady.executionSessionId).toBeNull();
    expect(automaticReady.resultSessionId).toBeNull();
    expect(manualRetry.status).toBe('READY');
    expect(manualRetry.executionSessionId).toBeNull();
    expect(manualRetry.resultSessionId).toBeNull();
    expect(completed.status).toBe('COMPLETED');
  });

  it('executes ready and retryable tasks through explicit task execution', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Task Execute Project',
      repoPath: '/Users/example/task-execute-project',
    });
    const rootSessionId = 'acps_execute_root';
    insertAcpSession(sqlite, {
      cwd: '/Users/example/task-execute-project',
      id: rootSessionId,
      projectId: project.id,
      provider: 'codex',
    });

    const readyTask = await createTask(sqlite, {
      objective: 'Execute a ready task directly',
      projectId: project.id,
      status: 'READY',
      title: 'Ready task',
      sessionId: rootSessionId,
    });
    const failedTask = await createTask(sqlite, {
      objective: 'Retry a failed task explicitly',
      projectId: project.id,
      status: 'FAILED',
      title: 'Failed task',
      sessionId: rootSessionId,
    });
    const completedTask = await createTask(sqlite, {
      objective: 'Reject already completed tasks',
      projectId: project.id,
      status: 'COMPLETED',
      title: 'Completed task',
      sessionId: rootSessionId,
    });

    let sessionCount = 0;
    const createSession = vi.fn(async () => {
      const id = `acps_execute_${++sessionCount}`;
      insertAcpSession(sqlite, {
        cwd: '/Users/example/task-execute-project',
        id,
        projectId: project.id,
        provider: 'codex',
      });
      return { id };
    });
    const promptSession = vi.fn(async () => undefined);
    const callbacks = {
      createSession,
      promptSession,
    };

    const readyResult = await executeTaskSession(sqlite, readyTask.id, {
      callbacks,
      callerSessionId: rootSessionId,
    });

    expect(readyResult.dispatch).toMatchObject({
      attempted: true,
      errorMessage: null,
    });
    expect(readyResult.task).toMatchObject({
      triggerSessionId: 'acps_execute_1',
    });
    expect(readyResult.dispatch.result).toMatchObject({
      dispatched: true,
      reason: null,
      role: 'CRAFTER',
      sessionId: 'acps_execute_1',
    });

    const failedResult = await executeTaskSession(sqlite, failedTask.id, {
      callbacks,
      callerSessionId: rootSessionId,
    });

    expect(failedResult.task.status).toBe('READY');
    expect(failedResult.dispatch).toMatchObject({
      attempted: true,
      errorMessage: null,
    });
    expect(failedResult.dispatch.result).toMatchObject({
      dispatched: true,
      reason: null,
      role: 'CRAFTER',
    });

    expect(createSession).toHaveBeenCalledTimes(2);
    expect(promptSession).toHaveBeenCalledTimes(2);

    await expect(
      executeTaskSession(sqlite, completedTask.id, {
        callbacks,
        callerSessionId: rootSessionId,
      }),
    ).rejects.toMatchObject({
      status: 409,
      type: 'https://team-ai.dev/problems/task-execution-not-allowed',
    });
  });

  it('auto-creates a task worktree before dispatching implementation work', async () => {
    const sqlite = await createTestDatabase();
    const repoPath = await createGitRepository();
    const project = await createProject(sqlite, {
      title: 'Task Execute Worktree Project',
      repoPath,
    });
    const [codebase] = (await listProjectCodebases(sqlite, project.id)).items;
    const rootSessionId = 'acps_execute_worktree_root';
    insertAcpSession(sqlite, {
      cwd: repoPath,
      id: rootSessionId,
      projectId: project.id,
      provider: 'codex',
    });

    const task = await createTask(sqlite, {
      codebaseId: codebase.id,
      objective: 'Execute against a dedicated worktree',
      projectId: project.id,
      status: 'READY',
      title: 'Worktree task',
      sessionId: rootSessionId,
    });

    const createSession = vi.fn(async (input) => {
      insertAcpSession(sqlite, {
        cwd: input.cwd ?? repoPath,
        id: 'acps_execute_worktree_child',
        projectId: project.id,
        provider: input.provider,
        taskId: task.id,
      });
      return { id: 'acps_execute_worktree_child' };
    });
    const promptSession = vi.fn(async () => undefined);

    const result = await executeTaskSession(sqlite, task.id, {
      callbacks: {
        createSession,
        promptSession,
      },
      callerSessionId: rootSessionId,
    });

    expect(result.dispatch).toMatchObject({
      attempted: true,
      errorMessage: null,
    });
    expect(result.task.codebaseId).toBe(codebase.id);
    expect(result.task.worktreeId).toMatch(/^wt_/);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        codebaseId: codebase.id,
        cwd: expect.stringContaining('/Worktree-task'),
        taskId: task.id,
        worktreeId: result.task.worktreeId,
      }),
    );
  });

  it('records a retryable task failure when worktree preparation fails', async () => {
    const sqlite = await createTestDatabase();
    const repoPath = await mkdtemp(join(tmpdir(), 'team-ai-task-bad-repo-'));
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });

    const project = await createProject(sqlite, {
      title: 'Task Execute Worktree Failure Project',
      repoPath,
    });
    const [codebase] = (await listProjectCodebases(sqlite, project.id)).items;
    const rootSessionId = 'acps_execute_worktree_fail_root';
    insertAcpSession(sqlite, {
      cwd: repoPath,
      id: rootSessionId,
      projectId: project.id,
      provider: 'codex',
    });

    const task = await createTask(sqlite, {
      codebaseId: codebase.id,
      objective: 'Fail before dispatch when the repo is not a git worktree source',
      projectId: project.id,
      status: 'READY',
      title: 'Broken worktree task',
      sessionId: rootSessionId,
    });

    const createSession = vi.fn(async () => ({
      id: 'acps_should_not_exist',
    }));
    const promptSession = vi.fn(async () => undefined);

    const result = await executeTaskSession(sqlite, task.id, {
      callbacks: {
        createSession,
        promptSession,
      },
      callerSessionId: rootSessionId,
    });

    expect(result.dispatch).toMatchObject({
      attempted: false,
      errorMessage: expect.stringContaining('git'),
      result: null,
    });
    expect(result.task).toMatchObject({
      codebaseId: codebase.id,
      status: 'WAITING_RETRY',
      verificationVerdict: 'fail',
      worktreeId: null,
    });
    expect(createSession).not.toHaveBeenCalled();
    expect(promptSession).not.toHaveBeenCalled();
  });

  it('blocks explicit retries after the maximum retry boundary', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Task Execute Retry Limit Project',
      repoPath: '/Users/example/task-execute-retry-limit',
    });
    const rootSessionId = 'acps_execute_retry_limit_root';
    insertAcpSession(sqlite, {
      cwd: '/Users/example/task-execute-retry-limit',
      id: rootSessionId,
      projectId: project.id,
      provider: 'codex',
    });

    const task = await createTask(sqlite, {
      objective: 'Stop retrying once the retry budget is exhausted',
      projectId: project.id,
      status: 'FAILED',
      title: 'Retry limit task',
      sessionId: rootSessionId,
    });

    let latestRun = await startTaskRun(sqlite, {
      projectId: project.id,
      sessionId: rootSessionId,
      taskId: task.id,
    });
    latestRun = await failTaskRun(sqlite, latestRun.id, {
      summary: 'Initial execution failed',
      verificationVerdict: 'fail',
    });

    for (let attempt = 0; attempt < MAX_TASK_RUN_RETRY_COUNT; attempt += 1) {
      const retryRun = await startTaskRun(sqlite, {
        projectId: project.id,
        retryOfRunId: latestRun.id,
        sessionId: rootSessionId,
        taskId: task.id,
      });
      latestRun = await failTaskRun(sqlite, retryRun.id, {
        summary: `Retry ${attempt + 1} failed`,
        verificationVerdict: 'fail',
      });
    }

    await updateTask(sqlite, task.id, {
      resultSessionId: rootSessionId,
      status: 'FAILED',
      verificationVerdict: 'fail',
    });

    const createSession = vi.fn(async () => ({
      id: 'acps_should_not_retry',
    }));
    const promptSession = vi.fn(async () => undefined);

    await expect(
      executeTaskSession(sqlite, task.id, {
        callbacks: {
          createSession,
          promptSession,
        },
        callerSessionId: rootSessionId,
      }),
    ).rejects.toMatchObject({
      status: 409,
      type: 'https://team-ai.dev/problems/task-run-retry-limit-exceeded',
    });
    expect(createSession).not.toHaveBeenCalled();
    expect(promptSession).not.toHaveBeenCalled();
  });

  it('rejects task creation when ACP session belongs to another project', async () => {
    const sqlite = await createTestDatabase();
    const projectA = await createProject(sqlite, {
      title: 'Project A',
      repoPath: '/Users/example/project-a',
    });
    const projectB = await createProject(sqlite, {
      title: 'Project B',
      repoPath: '/Users/example/project-b',
    });
    const session = { id: 'acps_foreignsvc' };
    insertAcpSession(sqlite, {
      cwd: '/Users/example/project-a',
      id: session.id,
      name: 'Foreign session',
      projectId: projectA.id,
    });

    await expect(
      createTask(sqlite, {
        objective: 'Invalid linkage',
        projectId: projectB.id,
        title: 'Cross project task',
        sessionId: session.id,
      }),
    ).rejects.toMatchObject({
      status: 409,
      type: 'https://team-ai.dev/problems/task-session-project-mismatch',
    });
  });

  it('resolves specialist assignments from workspace directories', async () => {
    const sqlite = await createTestDatabase();
    const repoPath = await mkdtemp(
      join(tmpdir(), 'team-ai-task-specialist-workspace-'),
    );
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });
    await mkdir(join(repoPath, 'resources', 'specialists'), {
      recursive: true,
    });
    await writeFile(
      join(repoPath, 'resources', 'specialists', 'backend-crafter.md'),
      [
        '---',
        'id: backend-crafter',
        'name: Backend Crafter',
        'role: CRAFTER',
        'description: Implements backend changes.',
        '---',
        'Implement backend changes carefully.',
      ].join('\n'),
      'utf8',
    );

    const project = await createProject(sqlite, {
      repoPath,
      title: 'Specialist Task',
    });

    const task = await createTask(sqlite, {
      assignedSpecialistId: 'backend-crafter',
      objective: 'Use specialist role',
      projectId: project.id,
      title: 'Specialist task',
    });

    expect(task).toMatchObject({
      assignedRole: 'CRAFTER',
      assignedSpecialistId: 'backend-crafter',
      assignedSpecialistName: 'Backend Crafter',
    });
  });

  it('rejects invalid roles and specialist-role mismatches', async () => {
    const sqlite = await createTestDatabase();
    const repoPath = await mkdtemp(
      join(tmpdir(), 'team-ai-task-role-mismatch-'),
    );
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });
    await mkdir(join(repoPath, 'resources', 'specialists'), {
      recursive: true,
    });
    await writeFile(
      join(repoPath, 'resources', 'specialists', 'gate-reviewer.md'),
      [
        '---',
        'id: gate-reviewer',
        'name: Gate Reviewer',
        'role: GATE',
        'description: Reviews code.',
        '---',
        'Review work before completion.',
      ].join('\n'),
      'utf8',
    );
    const project = await createProject(sqlite, {
      repoPath,
      title: 'Role Mismatch',
    });

    await expect(
      createTask(sqlite, {
        assignedRole: 'planner',
        objective: 'Bad role',
        projectId: project.id,
        title: 'Invalid role task',
      }),
    ).rejects.toMatchObject({
      status: 400,
      type: 'https://team-ai.dev/problems/invalid-role',
    });

    await expect(
      createTask(sqlite, {
        assignedRole: 'CRAFTER',
        assignedSpecialistId: 'gate-reviewer',
        objective: 'Mismatch role',
        projectId: project.id,
        title: 'Mismatch role task',
      }),
    ).rejects.toMatchObject({
      status: 409,
      type: 'https://team-ai.dev/problems/specialist-role-mismatch',
    });
  });

  it('soft deletes tasks and hides them from reads', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Delete Task',
      repoPath: '/Users/example/delete-task',
    });
    const task = await createTask(sqlite, {
      objective: 'Delete objective',
      projectId: project.id,
      title: 'Delete task',
    });

    await deleteTask(sqlite, task.id);

    await expect(getTaskById(sqlite, task.id)).rejects.toMatchObject({
      status: 404,
      type: 'https://team-ai.dev/problems/task-not-found',
    });
  });

  it('assigns default workflow board and lane context from task kind and status', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Workflow Context',
      repoPath: '/Users/example/workflow-context',
    });

    const implementTask = await createTask(sqlite, {
      kind: 'implement',
      objective: 'Implement workflow UI',
      projectId: project.id,
      status: 'READY',
      title: 'Workflow UI',
    });
    const reviewTask = await createTask(sqlite, {
      kind: 'review',
      objective: 'Review workflow UI',
      projectId: project.id,
      status: 'PENDING',
      title: 'Workflow Review',
    });
    const runningTask = await updateTask(sqlite, implementTask.id, {
      status: 'RUNNING',
    });

    expect(implementTask).toMatchObject({
      boardId: 'workflow-default',
      columnId: 'todo',
    });
    expect(reviewTask).toMatchObject({
      boardId: 'workflow-default',
      columnId: 'review',
    });
    expect(runningTask).toMatchObject({
      boardId: 'workflow-default',
      columnId: 'dev',
    });
  });

  it('preserves the current board and column when updating non-workflow task fields', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Workflow Context Preservation',
      repoPath: '/Users/example/workflow-context-preservation',
    });
    const task = await createTask(sqlite, {
      boardId: 'workflow-default',
      columnId: 'review',
      kind: 'review',
      objective: 'Keep review lane while updating runtime metadata',
      projectId: project.id,
      title: 'Review metadata task',
    });

    const updated = await updateTask(sqlite, task.id, {
      laneHandoffs: [
        {
          fromSessionId: 'acps_review',
          id: 'handoff_preserve_lane',
          request: 'Share the review evidence',
          requestType: 'runtime_context',
          requestedAt: new Date().toISOString(),
          status: 'requested',
          toSessionId: 'acps_dev',
        },
      ],
      lastSyncError: 'waiting for runtime evidence',
    });

    expect(updated).toMatchObject({
      boardId: 'workflow-default',
      columnId: 'review',
      lastSyncError: 'waiting for runtime evidence',
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-task-service-'));
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

  async function createGitRepository() {
    const repoPath = await mkdtemp(join(tmpdir(), 'team-ai-task-service-repo-'));
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });

    await mkdir(repoPath, { recursive: true });
    await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: repoPath });
    await execFileAsync('git', ['config', 'user.name', 'Team AI Test'], {
      cwd: repoPath,
    });
    await execFileAsync('git', ['config', 'user.email', 'team-ai@example.test'], {
      cwd: repoPath,
    });
    await writeFile(join(repoPath, 'README.md'), '# test\n');
    await execFileAsync('git', ['add', 'README.md'], { cwd: repoPath });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: repoPath });
    return repoPath;
  }
});
