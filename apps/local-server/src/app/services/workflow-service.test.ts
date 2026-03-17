import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { listBackgroundTasks } from './background-task-service';
import { createProject } from './project-service';
import {
  createWorkflow,
  getWorkflowRunById,
  listProjectWorkflows,
  listWorkflowRuns,
  triggerWorkflow,
} from './workflow-service';

describe('workflow service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('creates and lists workflows for a project', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-workflow-service',
      title: 'Workflow Service',
    });

    const workflow = await createWorkflow(sqlite, {
      name: 'Ship slice',
      projectId: project.id,
      steps: [
        {
          name: 'Implement',
          parallelGroup: null,
          prompt: 'Implement ${trigger.payload}',
          specialistId: 'backend-crafter',
        },
      ],
    });

    expect(workflow).toMatchObject({
      name: 'Ship slice',
      projectId: project.id,
      steps: [
        expect.objectContaining({
          name: 'Implement',
          specialistId: 'backend-crafter',
        }),
      ],
      version: 1,
    });

    const workflows = await listProjectWorkflows(sqlite, project.id);
    expect(workflows.items.map((item) => item.id)).toContain(workflow.id);
  });

  it('triggers a workflow into background tasks with dependency chaining', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-workflow-trigger',
      title: 'Workflow Trigger',
    });

    const workflow = await createWorkflow(sqlite, {
      name: 'Deliver slice',
      projectId: project.id,
      steps: [
        {
          name: 'Implement API',
          parallelGroup: 'build',
          prompt: 'Implement ${trigger.payload}',
          specialistId: 'backend-crafter',
        },
        {
          name: 'Implement UI',
          parallelGroup: 'build',
          prompt: 'Design ${workflow.name}',
          specialistId: 'frontend-crafter',
        },
        {
          name: 'Review',
          parallelGroup: null,
          prompt: 'Review the delivery',
          specialistId: 'gate-reviewer',
        },
      ],
    });

    const result = await triggerWorkflow(sqlite, workflow.id, {
      triggerPayload: 'the feature slice',
    });

    expect(result.workflowRun).toMatchObject({
      blockedSteps: 1,
      currentStepName: 'Implement API',
      projectId: project.id,
      status: 'RUNNING',
      steps: [
        expect.objectContaining({
          blockedByStepNames: [],
          dependsOnStepNames: [],
          name: 'Implement API',
          status: 'PENDING',
        }),
        expect.objectContaining({
          blockedByStepNames: [],
          dependsOnStepNames: [],
          name: 'Implement UI',
          status: 'PENDING',
        }),
        expect.objectContaining({
          blockedByStepNames: ['Implement API', 'Implement UI'],
          dependsOnStepNames: ['Implement API', 'Implement UI'],
          name: 'Review',
          status: 'BLOCKED',
        }),
      ],
      totalSteps: 3,
      triggerPayload: 'the feature slice',
      triggerSource: 'manual',
      workflowId: workflow.id,
    });
    expect(result.taskIds).toHaveLength(3);

    const runs = await listWorkflowRuns(sqlite, workflow.id);
    expect(runs.items).toHaveLength(1);
    expect(getWorkflowRunById(sqlite, result.workflowRun.id)).toMatchObject({
      id: result.workflowRun.id,
      workflowName: 'Deliver slice',
    });

    const backgroundTasks = await listBackgroundTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
    });

    const implementApi = backgroundTasks.items.find(
      (item) => item.workflowStepName === 'Implement API',
    );
    const implementUi = backgroundTasks.items.find(
      (item) => item.workflowStepName === 'Implement UI',
    );
    const review = backgroundTasks.items.find(
      (item) => item.workflowStepName === 'Review',
    );

    expect(implementApi).toMatchObject({
      dependsOnTaskIds: [],
      prompt: 'Implement the feature slice',
      workflowRunId: result.workflowRun.id,
    });
    expect(implementUi).toMatchObject({
      dependsOnTaskIds: [],
      prompt: 'Design Deliver slice',
      workflowRunId: result.workflowRun.id,
    });
    expect(review?.dependsOnTaskIds.sort()).toEqual(
      [implementApi?.id, implementUi?.id].sort(),
    );
  });
});

async function createTestDatabase(cleanupTasks: Array<() => Promise<void>>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-workflow-service-'));
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
