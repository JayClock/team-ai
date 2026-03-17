import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createKanbanWorkflowOrchestrator } from './kanban-workflow-orchestrator-service';
import { listBackgroundTasks } from './background-task-service';
import { ensureDefaultKanbanBoard } from './kanban-board-service';
import { createKanbanEventService } from './kanban-event-service';
import { createProject } from './project-service';
import { createTask, getTaskById, updateTask } from './task-service';

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

  it('queues a background task when a card enters an automated column', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-kanban-orchestrator',
      title: 'Kanban Orchestrator',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const todoColumn = board.columns.find((column) => column.name === 'Todo');
    const devColumn = board.columns.find((column) => column.name === 'Dev');
    expect(todoColumn).toBeDefined();
    expect(devColumn).toBeDefined();

    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: todoColumn?.id ?? null,
      objective: 'Start work in the dev lane',
      projectId: project.id,
      title: 'Dev lane task',
    });

    const events = createKanbanEventService();
    const orchestrator = createKanbanWorkflowOrchestrator({
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

    const backgroundTasks = await listBackgroundTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
    });

    expect(backgroundTasks.items).toHaveLength(1);
    expect(backgroundTasks.items[0]).toMatchObject({
      projectId: project.id,
      taskId: task.id,
      title: expect.stringContaining('Dev'),
      triggerSource: 'workflow',
      triggeredBy: 'kanban-workflow-orchestrator',
    });
    expect(orchestrator.getActiveAutomations()).toEqual([
      expect.objectContaining({
        backgroundTaskId: backgroundTasks.items[0].id,
        columnId: devColumn?.id,
        taskId: task.id,
      }),
    ]);

    orchestrator.stop();
  });

  it('auto-advances a successful automated review task into the next column', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-kanban-auto-advance',
      title: 'Kanban Auto Advance',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const reviewColumn = board.columns.find((column) => column.name === 'Review');
    const doneColumn = board.columns.find((column) => column.name === 'Done');
    expect(reviewColumn).toBeDefined();
    expect(doneColumn).toBeDefined();

    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: reviewColumn?.id ?? null,
      objective: 'Let review automation finish and move forward',
      projectId: project.id,
      title: 'Review lane task',
    });

    const events = createKanbanEventService();
    const orchestrator = createKanbanWorkflowOrchestrator({
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
      toColumnId: reviewColumn?.id ?? '',
      type: 'task.column-transition',
    });

    const backgroundTasks = await listBackgroundTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
    });
    expect(backgroundTasks.items).toHaveLength(1);

    await events.emit({
      backgroundTaskId: backgroundTasks.items[0].id,
      projectId: project.id,
      success: true,
      taskId: task.id,
      type: 'background-task.completed',
    });

    const advancedTask = await getTaskById(sqlite, task.id);
    expect(advancedTask).toMatchObject({
      columnId: doneColumn?.id,
      status: 'COMPLETED',
    });
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
