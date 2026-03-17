import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createBackgroundWorkerService } from './background-worker-service';
import { createKanbanEventService } from './kanban-event-service';
import { createProject } from './project-service';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import {
  createWorkflow,
  getWorkflowRunById,
  triggerWorkflow,
} from './workflow-service';
import { createWorkflowExecutorService } from './workflow-executor-service';

describe('workflow executor service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('advances workflow runs as background tasks complete', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      title: 'Workflow Executor',
    });
    const workflow = await createWorkflow(sqlite, {
      name: 'Deliver slice',
      projectId: project.id,
      steps: [
        {
          name: 'Implement API',
          parallelGroup: 'build',
          prompt: 'Implement API',
          specialistId: 'backend-crafter',
        },
        {
          name: 'Implement UI',
          parallelGroup: 'build',
          prompt: 'Implement UI',
          specialistId: 'frontend-crafter',
        },
        {
          name: 'Review',
          parallelGroup: null,
          prompt: 'Review slice',
          specialistId: 'gate-reviewer',
        },
      ],
    });
    const triggered = await triggerWorkflow(sqlite, workflow.id);

    const events = createKanbanEventService();
    const workflowExecutor = createWorkflowExecutorService({
      events,
      sqlite,
    });
    workflowExecutor.start();

    const worker = createBackgroundWorkerService({
      callbacks: {
        createSession: async (task) => {
          const sessionId = `acps_${task.id}`;
          insertAcpSession(sqlite, {
            id: sessionId,
            projectId: task.projectId,
            taskId: task.taskId,
          });
          return {
            sessionId,
          };
        },
        isSessionActive: async () => true,
        promptSession: async () => undefined,
      },
      events,
      sqlite,
    });

    await worker.dispatchPending(2);

    expect(getWorkflowRunById(sqlite, triggered.workflowRun.id)).toMatchObject({
      blockedSteps: 0,
      completedSteps: 2,
      currentStepName: 'Review',
      failedSteps: 0,
      pendingSteps: 1,
      runningSteps: 0,
      status: 'RUNNING',
    });

    await worker.dispatchPending(2);

    expect(getWorkflowRunById(sqlite, triggered.workflowRun.id)).toMatchObject({
      blockedSteps: 0,
      completedAt: expect.any(String),
      completedSteps: 3,
      currentStepName: null,
      failedSteps: 0,
      pendingSteps: 0,
      runningSteps: 0,
      status: 'COMPLETED',
    });

    workflowExecutor.stop();
  });

  it('marks the workflow run failed when a background task fails', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      title: 'Workflow Executor Failure',
    });
    const workflow = await createWorkflow(sqlite, {
      name: 'Broken slice',
      projectId: project.id,
      steps: [
        {
          name: 'Implement',
          parallelGroup: null,
          prompt: 'Implement broken slice',
          specialistId: 'backend-crafter',
        },
      ],
    });
    const triggered = await triggerWorkflow(sqlite, workflow.id);

    const events = createKanbanEventService();
    const workflowExecutor = createWorkflowExecutorService({
      events,
      sqlite,
    });
    workflowExecutor.start();

    const worker = createBackgroundWorkerService({
      callbacks: {
        createSession: async (task) => {
          const sessionId = `acps_${task.id}`;
          insertAcpSession(sqlite, {
            id: sessionId,
            projectId: task.projectId,
            taskId: task.taskId,
          });
          return {
            sessionId,
          };
        },
        isSessionActive: async () => true,
        promptSession: async () => {
          throw new Error('workflow step failed');
        },
      },
      events,
      sqlite,
    });

    await worker.dispatchPending(1);

    expect(getWorkflowRunById(sqlite, triggered.workflowRun.id)).toMatchObject({
      blockedSteps: 0,
      completedAt: expect.any(String),
      completedSteps: 0,
      currentStepName: 'Implement',
      failedSteps: 1,
      pendingSteps: 0,
      runningSteps: 0,
      status: 'FAILED',
    });

    workflowExecutor.stop();
  });
});

async function createTestDatabase(cleanupTasks: Array<() => Promise<void>>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-workflow-executor-'));
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
