import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { listBackgroundTasks } from './background-task-service';
import { createProject } from './project-service';
import {
  createSchedule,
  getScheduleById,
  listProjectSchedules,
  tickDueSchedules,
} from './schedule-service';
import { createWorkflow, listWorkflowRuns } from './workflow-service';

describe('schedule service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('creates and lists schedules for a project', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-schedule-service',
      title: 'Schedule Service',
    });
    const workflow = await createWorkflow(sqlite, {
      name: 'Nightly workflow',
      projectId: project.id,
      steps: [
        {
          name: 'Implement',
          parallelGroup: null,
          prompt: 'Implement nightly work',
          specialistId: 'backend-crafter',
        },
      ],
    });

    const schedule = await createSchedule(sqlite, {
      cronExpr: '0 9 * * *',
      name: 'Morning run',
      projectId: project.id,
      triggerPayloadTemplate: 'Triggered at {timestamp}',
      workflowId: workflow.id,
    });

    expect(schedule).toMatchObject({
      cronExpr: '0 9 * * *',
      enabled: true,
      projectId: project.id,
      workflowId: workflow.id,
    });
    expect(schedule.nextRunAt).toEqual(expect.any(String));

    const listed = await listProjectSchedules(sqlite, project.id);
    expect(listed.items.map((item) => item.id)).toContain(schedule.id);
    expect(await getScheduleById(sqlite, schedule.id)).toMatchObject({
      id: schedule.id,
      workflowId: workflow.id,
    });
  });

  it('ticks due schedules into workflow runs instead of ACP sessions', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-schedule-tick',
      title: 'Schedule Tick',
    });
    const workflow = await createWorkflow(sqlite, {
      name: 'Scheduled workflow',
      projectId: project.id,
      steps: [
        {
          name: 'Implement',
          parallelGroup: null,
          prompt: 'Implement for {scheduleName}',
          specialistId: 'backend-crafter',
        },
      ],
    });

    const schedule = await createSchedule(sqlite, {
      cronExpr: '* * * * *',
      name: 'Immediate run',
      projectId: project.id,
      triggerPayloadTemplate: 'Schedule {scheduleName} at {timestamp}',
      workflowId: workflow.id,
    });

    const tickAt = new Date(Date.now() + 5 * 60 * 1000);
    const tickResult = await tickDueSchedules(sqlite, tickAt);

    expect(tickResult.firedScheduleIds).toContain(schedule.id);
    expect(tickResult.workflowRunIds).toHaveLength(1);

    const scheduleAfterTick = await getScheduleById(sqlite, schedule.id);
    expect(scheduleAfterTick).toMatchObject({
      lastRunAt: tickAt.toISOString(),
      lastWorkflowRunId: tickResult.workflowRunIds[0],
    });

    const runs = await listWorkflowRuns(sqlite, workflow.id);
    expect(runs.items).toEqual([
      expect.objectContaining({
        id: tickResult.workflowRunIds[0],
        triggerSource: 'schedule',
        workflowId: workflow.id,
      }),
    ]);

    const backgroundTasks = await listBackgroundTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
    });
    expect(backgroundTasks.items).toEqual([
      expect.objectContaining({
        triggerSource: 'workflow',
        workflowRunId: tickResult.workflowRunIds[0],
      }),
    ]);
  });
});

async function createTestDatabase(cleanupTasks: Array<() => Promise<void>>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-schedule-service-'));
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
