import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createKanbanWorkflowOrchestrator } from './kanban-workflow-orchestrator-service';
import { ensureDefaultKanbanBoard } from './kanban-board-service';
import { createKanbanEventService } from './kanban-event-service';
import { listProjectCodebases } from './project-codebase-service';
import { createProject } from './project-service';
import { createTask, getTaskById, updateTask } from './task-service';

const execFileAsync = promisify(execFile);

describe('kanban workflow orchestrator service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('starts one task session when a card enters an automated column', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      title: 'Kanban Orchestrator',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const todoColumn = board.columns.find((column) => column.name === 'Todo');
    const devColumn = board.columns.find((column) => column.name === 'Dev');
    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: todoColumn?.id ?? null,
      objective: 'Start work in the dev lane',
      projectId: project.id,
      title: 'Dev lane task',
    });

    const startTaskSession = vi.fn(async () => ({
      sessionId: 'acps_dev_lane_task',
    }));
    const events = createKanbanEventService();
    const orchestrator = createKanbanWorkflowOrchestrator({
      callbacks: {
        startTaskSession,
      },
      events,
      sqlite,
    });
    orchestrator.start();

    await updateTask(sqlite, task.id, {
      boardId: board.id,
      columnId: devColumn?.id ?? null,
      status: 'READY',
    });
    await events.emit({
      boardId: board.id,
      fromColumnId: todoColumn?.id ?? null,
      projectId: project.id,
      taskId: task.id,
      taskTitle: task.title,
      toColumnId: devColumn?.id ?? '',
      type: 'task.column-transition',
    });

    expect(startTaskSession).toHaveBeenCalledTimes(1);
    expect(orchestrator.getActiveAutomations()).toEqual([
      expect.objectContaining({
        columnId: devColumn?.id,
        sessionId: 'acps_dev_lane_task',
        taskId: task.id,
        triggerSessionId: 'acps_dev_lane_task',
      }),
    ]);
    expect(orchestrator.getQueuedAutomations()).toEqual([]);

    orchestrator.stop();
  });

  it('queues one active automation per board and drains the next card after completion', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      title: 'Kanban Queue',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const todoColumn = board.columns.find((column) => column.name === 'Todo');
    const reviewColumn = board.columns.find((column) => column.name === 'Review');
    const firstTask = await createTask(sqlite, {
      boardId: board.id,
      columnId: todoColumn?.id ?? null,
      objective: 'First card through the queue',
      projectId: project.id,
      title: 'First queued task',
    });
    const secondTask = await createTask(sqlite, {
      boardId: board.id,
      columnId: todoColumn?.id ?? null,
      objective: 'Second card through the queue',
      projectId: project.id,
      title: 'Second queued task',
    });

    const sessionIds = ['acps_queue_first', 'acps_queue_second'];
    const startTaskSession = vi.fn(async () => ({
      sessionId: sessionIds.shift(),
    }));
    const events = createKanbanEventService();
    const orchestrator = createKanbanWorkflowOrchestrator({
      boardConcurrency: 1,
      callbacks: {
        startTaskSession,
      },
      events,
      sqlite,
    });
    orchestrator.start();

    await updateTask(sqlite, firstTask.id, {
      columnId: reviewColumn?.id ?? null,
    });
    await events.emit({
      boardId: board.id,
      fromColumnId: todoColumn?.id ?? null,
      projectId: project.id,
      taskId: firstTask.id,
      taskTitle: firstTask.title,
      toColumnId: reviewColumn?.id ?? '',
      type: 'task.column-transition',
    });
    await updateTask(sqlite, secondTask.id, {
      columnId: reviewColumn?.id ?? null,
    });
    await events.emit({
      boardId: board.id,
      fromColumnId: todoColumn?.id ?? null,
      projectId: project.id,
      taskId: secondTask.id,
      taskTitle: secondTask.title,
      toColumnId: reviewColumn?.id ?? '',
      type: 'task.column-transition',
    });

    expect(startTaskSession).toHaveBeenCalledTimes(1);
    expect(orchestrator.getActiveAutomations()).toEqual([
      expect.objectContaining({
        sessionId: 'acps_queue_first',
        taskId: firstTask.id,
      }),
    ]);
    expect(orchestrator.getQueuedAutomations()).toEqual([
      expect.objectContaining({
        boardId: board.id,
        columnId: reviewColumn?.id,
        taskId: secondTask.id,
      }),
    ]);

    await events.emit({
      projectId: project.id,
      sessionId: 'acps_queue_first',
      success: true,
      taskId: firstTask.id,
      type: 'task.session-completed',
    });

    expect(startTaskSession).toHaveBeenCalledTimes(2);
    expect(orchestrator.getActiveAutomations()).toEqual([
      expect.objectContaining({
        sessionId: 'acps_queue_second',
        taskId: secondTask.id,
      }),
    ]);
    expect(orchestrator.getQueuedAutomations()).toEqual([]);

    orchestrator.stop();
  });

  it('prepares a worktree-backed crafter task before starting dev automation', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const repoPath = await createGitRepository(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath,
      title: 'Kanban Dev Worktree',
    });
    const [codebase] = (await listProjectCodebases(sqlite, project.id)).items;
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const todoColumn = board.columns.find((column) => column.name === 'Todo');
    const devColumn = board.columns.find((column) => column.name === 'Dev');
    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: todoColumn?.id ?? null,
      objective: 'Prepare a dedicated workspace before dev automation',
      projectId: project.id,
      title: 'Dev worktree task',
    });

    const startTaskSession = vi.fn(async () => ({
      sessionId: 'acps_dev_worktree_task',
    }));
    const events = createKanbanEventService();
    const orchestrator = createKanbanWorkflowOrchestrator({
      callbacks: {
        startTaskSession,
      },
      events,
      sqlite,
    });
    orchestrator.start();

    await updateTask(sqlite, task.id, {
      columnId: devColumn?.id ?? null,
    });
    await events.emit({
      boardId: board.id,
      fromColumnId: todoColumn?.id ?? null,
      projectId: project.id,
      taskId: task.id,
      taskTitle: task.title,
      toColumnId: devColumn?.id ?? '',
      type: 'task.column-transition',
    });

    const preparedTask = await getTaskById(sqlite, task.id);
    expect(preparedTask).toMatchObject({
      assignedRole: 'CRAFTER',
      codebaseId: codebase.id,
      status: 'READY',
    });
    expect(preparedTask.worktreeId).toMatch(/^wt_/);
    expect(startTaskSession).toHaveBeenCalledTimes(1);

    orchestrator.stop();
  });

  it('stops dev automation and marks the task retryable when worktree preparation fails', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const repoPath = await mkdtemp(join(tmpdir(), 'team-ai-kanban-bad-repo-'));
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });
    const project = await createProject(sqlite, {
      repoPath,
      title: 'Kanban Dev Worktree Failure',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const todoColumn = board.columns.find((column) => column.name === 'Todo');
    const devColumn = board.columns.find((column) => column.name === 'Dev');
    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: todoColumn?.id ?? null,
      objective: 'Do not queue automation when worktree setup fails',
      projectId: project.id,
      title: 'Dev worktree failure task',
    });

    const startTaskSession = vi.fn(async () => ({
      sessionId: 'acps_should_not_start',
    }));
    const events = createKanbanEventService();
    const orchestrator = createKanbanWorkflowOrchestrator({
      callbacks: {
        startTaskSession,
      },
      events,
      sqlite,
    });
    orchestrator.start();

    await updateTask(sqlite, task.id, {
      columnId: devColumn?.id ?? null,
    });
    await events.emit({
      boardId: board.id,
      fromColumnId: todoColumn?.id ?? null,
      projectId: project.id,
      taskId: task.id,
      taskTitle: task.title,
      toColumnId: devColumn?.id ?? '',
      type: 'task.column-transition',
    });

    const failedTask = await getTaskById(sqlite, task.id);
    expect(failedTask).toMatchObject({
      assignedRole: 'CRAFTER',
      status: 'WAITING_RETRY',
      verificationVerdict: 'fail',
      worktreeId: null,
    });
    expect(startTaskSession).not.toHaveBeenCalled();
    expect(orchestrator.getActiveAutomations()).toEqual([]);

    orchestrator.stop();
  });

  it('auto-advances a successful automated review task into the next column', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      title: 'Kanban Auto Advance',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const reviewColumn = board.columns.find((column) => column.name === 'Review');
    const doneColumn = board.columns.find((column) => column.name === 'Done');
    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: reviewColumn?.id ?? null,
      objective: 'Let review automation finish and move forward',
      projectId: project.id,
      title: 'Review lane task',
    });

    const startTaskSession = vi.fn(async () => ({
      sessionId: 'acps_review_lane',
    }));
    const events = createKanbanEventService();
    const orchestrator = createKanbanWorkflowOrchestrator({
      callbacks: {
        startTaskSession,
      },
      events,
      sqlite,
    });
    orchestrator.start();

    await updateTask(sqlite, task.id, {
      columnId: reviewColumn?.id ?? null,
    });
    await events.emit({
      boardId: board.id,
      fromColumnId: null,
      projectId: project.id,
      taskId: task.id,
      taskTitle: task.title,
      toColumnId: reviewColumn?.id ?? '',
      type: 'task.column-transition',
    });

    await events.emit({
      projectId: project.id,
      sessionId: 'acps_review_lane',
      success: true,
      taskId: task.id,
      type: 'task.session-completed',
    });

    const advancedTask = await getTaskById(sqlite, task.id);
    expect(advancedTask).toMatchObject({
      columnId: doneColumn?.id,
      status: 'COMPLETED',
    });
    expect(orchestrator.getActiveAutomations()).toEqual([]);

    orchestrator.stop();
  });

  it('ignores duplicate completion events for the same task session', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      title: 'Kanban Session Binding',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const reviewColumn = board.columns.find((column) => column.name === 'Review');
    const doneColumn = board.columns.find((column) => column.name === 'Done');
    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: reviewColumn?.id ?? null,
      objective: 'Advance only once from a bound trigger session',
      projectId: project.id,
      title: 'Session-bound review task',
    });

    const startTaskSession = vi.fn(async () => ({
      sessionId: 'acps_bound_review',
    }));
    const events = createKanbanEventService();
    const orchestrator = createKanbanWorkflowOrchestrator({
      callbacks: {
        startTaskSession,
      },
      events,
      sqlite,
    });
    orchestrator.start();

    await updateTask(sqlite, task.id, {
      columnId: reviewColumn?.id ?? null,
    });
    await events.emit({
      boardId: board.id,
      fromColumnId: null,
      projectId: project.id,
      taskId: task.id,
      taskTitle: task.title,
      toColumnId: reviewColumn?.id ?? '',
      type: 'task.column-transition',
    });

    await events.emit({
      projectId: project.id,
      sessionId: 'acps_bound_review',
      success: true,
      taskId: task.id,
      type: 'task.session-completed',
    });
    await events.emit({
      projectId: project.id,
      sessionId: 'acps_bound_review',
      success: true,
      taskId: task.id,
      type: 'task.session-completed',
    });

    const advancedTask = await getTaskById(sqlite, task.id);
    expect(advancedTask).toMatchObject({
      columnId: doneColumn?.id,
      status: 'COMPLETED',
    });
    expect(orchestrator.getActiveAutomations()).toEqual([]);

    orchestrator.stop();
  });

  it('cancels the running task session when a card leaves the automation column', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      title: 'Kanban Cancel Session',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const todoColumn = board.columns.find((column) => column.name === 'Todo');
    const reviewColumn = board.columns.find((column) => column.name === 'Review');
    const doneColumn = board.columns.find((column) => column.name === 'Done');
    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: todoColumn?.id ?? null,
      objective: 'Cancel the running session when the card moves away',
      projectId: project.id,
      title: 'Session cancellation task',
    });

    const cancelTaskSession = vi.fn(async () => undefined);
    const startTaskSession = vi.fn(async () => ({
      sessionId: 'acps_cancel_me',
    }));
    const events = createKanbanEventService();
    const orchestrator = createKanbanWorkflowOrchestrator({
      callbacks: {
        cancelTaskSession,
        startTaskSession,
      },
      events,
      sqlite,
    });
    orchestrator.start();

    await updateTask(sqlite, task.id, {
      columnId: reviewColumn?.id ?? null,
    });
    await events.emit({
      boardId: board.id,
      fromColumnId: todoColumn?.id ?? null,
      projectId: project.id,
      taskId: task.id,
      taskTitle: task.title,
      toColumnId: reviewColumn?.id ?? '',
      type: 'task.column-transition',
    });

    await updateTask(sqlite, task.id, {
      columnId: doneColumn?.id ?? null,
    });
    await events.emit({
      boardId: board.id,
      fromColumnId: reviewColumn?.id ?? null,
      projectId: project.id,
      taskId: task.id,
      taskTitle: task.title,
      toColumnId: doneColumn?.id ?? '',
      type: 'task.column-transition',
    });

    expect(cancelTaskSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: task.id,
      }),
      'acps_cancel_me',
    );
    expect(orchestrator.getActiveAutomations()).toEqual([]);

    orchestrator.stop();
  });
});

async function createTestDatabase(cleanupTasks: Array<() => Promise<void>>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-kanban-orchestrator-'));
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

async function createGitRepository(cleanupTasks: Array<() => Promise<void>>) {
  const repoPath = await mkdtemp(join(tmpdir(), 'team-ai-kanban-repo-'));
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
  await writeFile(join(repoPath, 'README.md'), '# kanban\n');
  await execFileAsync('git', ['add', 'README.md'], { cwd: repoPath });
  await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: repoPath });

  return repoPath;
}
