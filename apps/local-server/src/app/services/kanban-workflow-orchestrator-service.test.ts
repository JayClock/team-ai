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
import { createTaskLaneHandoff, upsertTaskLaneHandoff } from './task-lane-service';
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
    const doneColumn = board.columns.find((column) => column.name === 'Done');
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
    expect(orchestrator.getQueuedAutomations()).toEqual([
      expect.objectContaining({
        columnId: doneColumn?.id,
        taskId: firstTask.id,
      }),
    ]);

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

  it('assigns Todo automation from explicit column configuration and advances to Dev on success', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      title: 'Kanban Todo Automation',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const backlogColumn = board.columns.find((column) => column.name === 'Backlog');
    const todoColumn = board.columns.find((column) => column.name === 'Todo');
    const devColumn = board.columns.find((column) => column.name === 'Dev');
    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: backlogColumn?.id ?? null,
      objective: 'Route planning work through the Todo lane before implementation',
      projectId: project.id,
      title: 'Todo automation task',
    });

    const startTaskSession = vi.fn(async () => ({
      sessionId: 'acps_todo_automation',
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
      columnId: todoColumn?.id ?? null,
      status: 'PENDING',
    });
    await events.emit({
      boardId: board.id,
      fromColumnId: backlogColumn?.id ?? null,
      projectId: project.id,
      taskId: task.id,
      taskTitle: task.title,
      toColumnId: todoColumn?.id ?? '',
      type: 'task.column-transition',
    });

    const queuedTodoTask = await getTaskById(sqlite, task.id);
    expect(queuedTodoTask).toMatchObject({
      assignedRole: 'ROUTA',
      assignedSpecialistId: 'todo-orchestrator',
      assignedSpecialistName: 'Todo Orchestrator',
      columnId: todoColumn?.id,
      status: 'PENDING',
    });
    expect(startTaskSession).toHaveBeenCalledTimes(1);

    await events.emit({
      projectId: project.id,
      sessionId: 'acps_todo_automation',
      success: true,
      taskId: task.id,
      type: 'task.session-completed',
    });

    const advancedTask = await getTaskById(sqlite, task.id);
    expect(advancedTask).toMatchObject({
      columnId: devColumn?.id,
      status: 'READY',
    });

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
    expect(orchestrator.getActiveAutomations()).toEqual([
      expect.objectContaining({
        columnId: doneColumn?.id,
        sessionId: 'acps_review_lane',
        taskId: task.id,
      }),
    ]);

    orchestrator.stop();
  });

  it('blocks queue dispatch when board WIP exceeds the configured limit', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      title: 'Kanban Queue WIP Policy',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const devColumn = board.columns.find((column) => column.name === 'Dev');
    if (!devColumn) {
      throw new Error('Dev column is required for the test');
    }

    setBoardWipLimit(sqlite, board.id, 1);
    await createTask(sqlite, {
      boardId: board.id,
      columnId: devColumn.id,
      objective: 'Already in progress',
      projectId: project.id,
      title: 'Existing WIP task',
    });
    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: devColumn.id,
      objective: 'Try to start another automation',
      projectId: project.id,
      title: 'Queued behind WIP limit',
    });

    const startTaskSession = vi.fn(async () => ({
      sessionId: 'acps_wip_limited',
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

    await events.emit({
      boardId: board.id,
      fromColumnId: null,
      projectId: project.id,
      taskId: task.id,
      taskTitle: task.title,
      toColumnId: devColumn.id,
      type: 'task.column-transition',
    });

    const blockedTask = await getTaskById(sqlite, task.id);
    expect(blockedTask.lastSyncError).toContain('Board WIP limit reached');
    expect(startTaskSession).not.toHaveBeenCalled();

    orchestrator.stop();
  });

  it('routes failed review automation back to Dev with the review summary attached', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      title: 'Kanban Review Fallback',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const devColumn = board.columns.find((column) => column.name === 'Dev');
    const reviewColumn = board.columns.find((column) => column.name === 'Review');
    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: reviewColumn?.id ?? null,
      objective: 'Send failed review work back to implementation with context',
      projectId: project.id,
      title: 'Review fallback task',
      verificationReport: 'Tests failed on the regression path.',
      verificationVerdict: 'fail',
    });

    const startTaskSession = vi.fn(async () => ({
      sessionId: 'acps_review_failed',
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
      fromColumnId: devColumn?.id ?? null,
      projectId: project.id,
      taskId: task.id,
      taskTitle: task.title,
      toColumnId: reviewColumn?.id ?? '',
      type: 'task.column-transition',
    });

    await events.emit({
      projectId: project.id,
      sessionId: 'acps_review_failed',
      success: true,
      taskId: task.id,
      type: 'task.session-completed',
    });

    const failedTask = await getTaskById(sqlite, task.id);
    expect(failedTask).toMatchObject({
      columnId: devColumn?.id,
      lastSyncError: 'Tests failed on the regression path.',
      status: 'READY',
    });

    orchestrator.stop();
  });

  it('blocks auto-advance when the next column requires manual approval', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      title: 'Kanban Manual Approval Policy',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const devColumn = board.columns.find((column) => column.name === 'Dev');
    const reviewColumn = board.columns.find((column) => column.name === 'Review');
    if (!devColumn || !reviewColumn) {
      throw new Error('Dev and Review columns are required for the test');
    }

    patchColumnAutomation(sqlite, reviewColumn.id, {
      manualApprovalRequired: true,
    });

    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: devColumn.id,
      objective: 'Do not auto-advance into review without approval',
      projectId: project.id,
      title: 'Manual approval task',
    });

    const events = createKanbanEventService();
    const orchestrator = createKanbanWorkflowOrchestrator({
      callbacks: {
        startTaskSession: vi.fn(async () => ({
          sessionId: 'acps_manual_approval',
        })),
      },
      events,
      sqlite,
    });
    orchestrator.start();

    await events.emit({
      boardId: board.id,
      fromColumnId: null,
      projectId: project.id,
      taskId: task.id,
      taskTitle: task.title,
      toColumnId: devColumn.id,
      type: 'task.column-transition',
    });

    await events.emit({
      boardId: board.id,
      projectId: project.id,
      sessionId: 'acps_manual_approval',
      success: true,
      taskId: task.id,
      taskTitle: task.title,
      type: 'task.session-completed',
    });

    const blockedTask = await getTaskById(sqlite, task.id);
    expect(blockedTask).toMatchObject({
      columnId: devColumn.id,
      lastSyncError: expect.stringContaining('requires manual approval'),
    });

    orchestrator.stop();
  });

  it('blocks review auto-advance when required artifacts are missing', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      title: 'Kanban Artifact Gate',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const reviewColumn = board.columns.find((column) => column.name === 'Review');
    const doneColumn = board.columns.find((column) => column.name === 'Done');
    if (!reviewColumn) {
      throw new Error('Review column is required for the test');
    }

    setColumnRequiredArtifacts(sqlite, reviewColumn.id, ['local URL']);
    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: reviewColumn.id,
      objective: 'Do not move review work forward without concrete evidence',
      projectId: project.id,
      title: 'Artifact gate review task',
    });

    const events = createKanbanEventService();
    const orchestrator = createKanbanWorkflowOrchestrator({
      callbacks: {
        startTaskSession: vi.fn(async () => ({
          sessionId: 'acps_artifact_gate_review',
        })),
      },
      events,
      sqlite,
    });
    orchestrator.start();

    await updateTask(sqlite, task.id, {
      boardId: board.id,
      columnId: reviewColumn.id,
    });
    await events.emit({
      boardId: board.id,
      fromColumnId: null,
      projectId: project.id,
      taskId: task.id,
      taskTitle: task.title,
      toColumnId: reviewColumn.id,
      type: 'task.column-transition',
    });

    await events.emit({
      projectId: project.id,
      sessionId: 'acps_artifact_gate_review',
      success: true,
      taskId: task.id,
      type: 'task.session-completed',
    });

    const gatedTask = await getTaskById(sqlite, task.id);
    expect(gatedTask).toMatchObject({
      columnId: reviewColumn.id,
      lastSyncError: expect.stringContaining('missing local URL'),
      status: 'PENDING',
      verificationReport: expect.stringContaining('missing local URL'),
      verificationVerdict: 'fail',
    });
    expect(gatedTask.columnId).not.toBe(doneColumn?.id ?? null);

    orchestrator.stop();
  });

  it('auto-advances review work after artifact evidence is attached to the lane handoff', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      title: 'Kanban Artifact Gate Pass',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const reviewColumn = board.columns.find((column) => column.name === 'Review');
    const doneColumn = board.columns.find((column) => column.name === 'Done');
    if (!reviewColumn) {
      throw new Error('Review column is required for the test');
    }

    setColumnRequiredArtifacts(sqlite, reviewColumn.id, ['local URL']);
    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: reviewColumn.id,
      objective: 'Advance once runtime evidence exists',
      projectId: project.id,
      title: 'Artifact-ready review task',
    });

    const events = createKanbanEventService();
    const orchestrator = createKanbanWorkflowOrchestrator({
      callbacks: {
        startTaskSession: vi.fn(async () => ({
          sessionId: 'acps_artifact_gate_ready',
        })),
      },
      events,
      sqlite,
    });
    orchestrator.start();

    await updateTask(sqlite, task.id, {
      boardId: board.id,
      columnId: reviewColumn.id,
    });
    await events.emit({
      boardId: board.id,
      fromColumnId: null,
      projectId: project.id,
      taskId: task.id,
      taskTitle: task.title,
      toColumnId: reviewColumn.id,
      type: 'task.column-transition',
    });

    upsertTaskLaneHandoff(
      task,
      createTaskLaneHandoff({
        artifactHints: ['local URL'],
        fromColumnId: reviewColumn.id,
        fromSessionId: 'acps_artifact_gate_ready',
        id: 'handoff_artifact_ready',
        request: 'Share the running local URL.',
        requestType: 'runtime_context',
        status: 'completed',
        toColumnId: board.columns.find((column) => column.name === 'Dev')?.id,
        toSessionId: 'acps_dev_previous',
      }),
    );
    task.laneHandoffs[0].artifactEvidence = ['http://127.0.0.1:3000'];
    task.laneHandoffs[0].responseSummary = 'App is available on http://127.0.0.1:3000.';
    await updateTask(sqlite, task.id, {
      laneHandoffs: task.laneHandoffs,
    });

    await events.emit({
      projectId: project.id,
      sessionId: 'acps_artifact_gate_ready',
      success: true,
      taskId: task.id,
      type: 'task.session-completed',
    });

    const advancedTask = await getTaskById(sqlite, task.id);
    expect(advancedTask).toMatchObject({
      columnId: doneColumn?.id,
      lastSyncError: null,
      status: 'COMPLETED',
    });

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
    expect(orchestrator.getActiveAutomations()).toEqual([
      expect.objectContaining({
        columnId: doneColumn?.id,
        sessionId: 'acps_bound_review',
        taskId: task.id,
      }),
    ]);

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
    expect(orchestrator.getActiveAutomations()).toEqual([
      expect.objectContaining({
        columnId: doneColumn?.id,
        sessionId: 'acps_cancel_me',
        taskId: task.id,
      }),
    ]);

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

function setColumnRequiredArtifacts(
  sqlite: ReturnType<typeof initializeDatabase>,
  columnId: string,
  requiredArtifacts: string[],
) {
  patchColumnAutomation(sqlite, columnId, {
    requiredArtifacts,
  });
}

function setBoardWipLimit(
  sqlite: ReturnType<typeof initializeDatabase>,
  boardId: string,
  wipLimit: number,
) {
  const row = sqlite
    .prepare(
      `
        SELECT settings_json
        FROM project_kanban_boards
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(boardId) as { settings_json: string } | undefined;
  if (!row) {
    throw new Error(`Board ${boardId} does not exist`);
  }

  const settings = JSON.parse(row.settings_json) as {
    boardConcurrency: number | null;
    managedTemplate?: 'custom' | 'workflow';
    wipLimit: number | null;
  };

  sqlite
    .prepare(
      `
        UPDATE project_kanban_boards
        SET settings_json = @settingsJson
        WHERE id = @boardId AND deleted_at IS NULL
      `,
    )
    .run({
      boardId,
      settingsJson: JSON.stringify({
        ...settings,
        wipLimit,
      }),
    });
}

function patchColumnAutomation(
  sqlite: ReturnType<typeof initializeDatabase>,
  columnId: string,
  patch: Partial<{
    allowedSourceColumnIds: string[];
    autoAdvanceOnSuccess: boolean;
    enabled: boolean;
    manualApprovalRequired: boolean;
    provider: string | null;
    requiredArtifacts: string[];
    role: string | null;
    specialistId: string | null;
    specialistName: string | null;
    transitionType: 'both' | 'entry' | 'exit';
  }>,
) {
  const row = sqlite
    .prepare(
      `
        SELECT automation_json
        FROM project_kanban_columns
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(columnId) as { automation_json: string | null } | undefined;
  if (!row?.automation_json) {
    throw new Error(`Column ${columnId} does not have automation metadata`);
  }

  const automation = JSON.parse(row.automation_json) as {
    allowedSourceColumnIds?: string[];
    autoAdvanceOnSuccess: boolean;
    enabled: boolean;
    manualApprovalRequired?: boolean;
    provider: string | null;
    requiredArtifacts: string[];
    role: string | null;
    specialistId: string | null;
    specialistName: string | null;
    transitionType: 'both' | 'entry' | 'exit';
  };

  sqlite
    .prepare(
      `
        UPDATE project_kanban_columns
        SET automation_json = @automationJson
        WHERE id = @columnId AND deleted_at IS NULL
      `,
    )
    .run({
      automationJson: JSON.stringify({
        ...automation,
        ...patch,
      }),
      columnId,
    });
}
