import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { updateBackgroundTaskStatus } from './background-task-service';
import { listBackgroundTasks } from './background-task-service';
import { createProject } from './project-service';
import {
  listFlowRuns,
  resolveBackgroundTaskFlowExecution,
  syncFlowWorkflowDefinition,
  triggerFlow,
} from './flow-runtime-service';
import { listProjectWorkflows } from './workflow-service';

describe('flow runtime service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('syncs a filesystem flow into a workflow definition', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-flow-sync-project',
      title: 'Flow Sync Project',
    });

    const workflow = await syncFlowWorkflowDefinition(
      sqlite,
      project.id,
      'simple-dev',
    );

    expect(workflow).toMatchObject({
      name: 'Flow · Simple Developer Task',
      projectId: project.id,
      steps: [
        expect.objectContaining({
          name: 'Execute Task',
          prompt: '${trigger.payload}',
          specialistId: 'developer',
        }),
      ],
    });

    const workflows = await listProjectWorkflows(sqlite, project.id);
    expect(workflows.items).toHaveLength(0);
  });

  it('triggers a filesystem flow into workflow runs and background tasks', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-flow-trigger-project',
      title: 'Flow Trigger Project',
    });

    const result = await triggerFlow(sqlite, {
      flowId: 'simple-dev',
      projectId: project.id,
      triggerPayload: 'Ship the slice',
    });

    expect(result.workflowRun).toMatchObject({
      projectId: project.id,
      status: 'RUNNING',
      totalSteps: 1,
      triggerPayload: 'Ship the slice',
      workflowId: result.workflow.id,
      workflowName: 'Flow · Simple Developer Task',
    });
    expect(result.taskIds).toHaveLength(1);

    const backgroundTasks = await listBackgroundTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
    });

    expect(backgroundTasks.items).toEqual([
      expect.objectContaining({
        prompt: 'Ship the slice',
        workflowRunId: result.workflowRun.id,
        workflowStepName: 'Execute Task',
      }),
    ]);

    const runs = await listFlowRuns(sqlite, project.id, 'simple-dev');
    expect(runs.items).toHaveLength(1);
    expect(runs.items[0]).toMatchObject({
      id: result.workflowRun.id,
      workflowId: result.workflow.id,
    });
  });

  it('renders downstream step prompts from prior step output and variables', async () => {
    const sqlite = await createTestDatabase();
    const repoPath = await mkdtemp(join(tmpdir(), 'team-ai-flow-rendering-'));
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });

    await mkdir(join(repoPath, 'resources', 'flows'), {
      recursive: true,
    });
    await writeFile(
      join(repoPath, 'resources', 'flows', 'review-loop.yaml'),
      [
        'name: "Review Loop"',
        'trigger:',
        '  type: manual',
        'variables:',
        '  reviewer: "gate"',
        '  target_model: "${OPENAI_MODEL:-gpt-5-mini}"',
        'steps:',
        '  - name: "Implement"',
        '    specialist: "developer"',
        '    input: |',
        '      Implement ${trigger.payload}',
        '    output_key: "implementation"',
        '  - name: "Review"',
        '    specialist: "gate"',
        '    config:',
        '      model: "${target_model}"',
        '    input: |',
        '      Review this output:',
        '      ${steps.Implement.output}',
      ].join('\n'),
      'utf8',
    );

    const project = await createProject(sqlite, {
      repoPath,
      title: 'Review Loop Project',
    });
    const result = await triggerFlow(sqlite, {
      flowId: 'review-loop',
      projectId: project.id,
      triggerPayload: 'the feature slice',
    });

    const tasks = await listBackgroundTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
    });
    const implementTask = tasks.items.find(
      (task) => task.workflowStepName === 'Implement',
    );
    const reviewTask = tasks.items.find(
      (task) => task.workflowStepName === 'Review',
    );

    expect(implementTask).toBeDefined();
    expect(reviewTask).toBeDefined();

    await updateBackgroundTaskStatus(
      sqlite,
      implementTask!.id,
      'COMPLETED',
      {
        completedAt: new Date().toISOString(),
        taskOutput: 'Implemented result',
      },
    );

    const execution = await resolveBackgroundTaskFlowExecution(
      sqlite,
      reviewTask!,
    );

    expect(execution).toMatchObject({
      modelOverride: 'gpt-5-mini',
    });
    expect(execution?.prompt).toContain('Implemented result');
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-flow-runtime-'));
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
