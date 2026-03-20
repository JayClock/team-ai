import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '@orchestration/runtime-acp';
import { and, asc, desc, eq, isNull, lte } from 'drizzle-orm';
import { getDrizzleDb } from '../db/drizzle';
import { projectSchedulesTable } from '../db/schema';
import type {
  CreateScheduleInput,
  ScheduleListPayload,
  SchedulePayload,
  TickSchedulesResult,
} from '../schemas/schedule';
import { getProjectById } from './project-service';
import { upsertExternalKanbanCard } from './kanban-external-trigger-service';
import { getWorkflowById, triggerWorkflow } from './workflow-service';

const scheduleIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface ScheduleRow {
  created_at: string;
  cron_expr: string;
  enabled: boolean;
  id: string;
  last_run_at: string | null;
  last_workflow_run_id: string | null;
  name: string;
  next_run_at: string | null;
  project_id: string;
  trigger_payload_template: string | null;
  trigger_target: 'workflow';
  updated_at: string;
  workflow_id: string;
}

function createScheduleId() {
  return `sch_${scheduleIdGenerator()}`;
}

function throwScheduleNotFound(scheduleId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/schedule-not-found',
    title: 'Schedule Not Found',
    status: 404,
    detail: `Schedule ${scheduleId} was not found`,
  });
}

function throwInvalidCronExpr(cronExpr: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/invalid-cron-expr',
    title: 'Invalid Cron Expression',
    status: 400,
    detail: `Cron expression "${cronExpr}" is not supported`,
  });
}

function validateCronExpr(expr: string) {
  const parts = expr.trim().split(/\s+/);
  return parts.length === 5;
}

function matchField(
  field: string,
  value: number,
  min: number,
  max: number,
): boolean {
  if (field === '*') {
    return true;
  }

  if (field.includes(',')) {
    return field.split(',').some((part) => matchField(part, value, min, max));
  }

  if (field.includes('-')) {
    const [lo, hi] = field.split('-').map(Number);
    return value >= lo && value <= hi;
  }

  if (field.startsWith('*/')) {
    const step = Number(field.slice(2));
    return Number.isFinite(step) && step > 0 && (value - min) % step === 0;
  }

  const exact = Number(field);
  return Number.isFinite(exact) && exact >= min && exact <= max && exact === value;
}

export function getNextRunTime(expr: string, from = new Date()) {
  if (!validateCronExpr(expr)) {
    return null;
  }

  const [min, hour, dom, mon, dow] = expr.trim().split(/\s+/);
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  for (let index = 0; index < 60 * 24 * 2; index += 1) {
    if (
      matchField(min, candidate.getMinutes(), 0, 59) &&
      matchField(hour, candidate.getHours(), 0, 23) &&
      matchField(dom, candidate.getDate(), 1, 31) &&
      matchField(mon, candidate.getMonth() + 1, 1, 12) &&
      matchField(dow, candidate.getDay(), 0, 6)
    ) {
      return candidate.toISOString();
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function resolveTriggerPayload(schedule: SchedulePayload) {
  const template = schedule.triggerPayloadTemplate?.trim();
  if (!template) {
    return null;
  }

  return template
    .replaceAll('{timestamp}', new Date().toISOString())
    .replaceAll('{cronExpr}', schedule.cronExpr)
    .replaceAll('{scheduleName}', schedule.name);
}

function buildScheduleKanbanCard(schedule: SchedulePayload) {
  const normalizedName = schedule.name.trim().toLowerCase();
  const isBlockedTriage =
    normalizedName.includes('blocked') || normalizedName.includes('triage');

  return {
    kind: 'plan' as const,
    labels: ['external:schedule', isBlockedTriage ? 'schedule:blocked' : 'schedule:backlog'],
    objective: isBlockedTriage
      ? `Run blocked-card triage for schedule ${schedule.name}.`
      : `Run backlog hygiene and refinement for schedule ${schedule.name}.`,
    sourceEventId: schedule.id,
    sourceType: 'schedule',
    stage: isBlockedTriage ? ('blocked' as const) : ('backlog' as const),
    title: isBlockedTriage
      ? `Blocked triage · ${schedule.name}`
      : `Scheduled refinement · ${schedule.name}`,
  };
}

function mapScheduleRow(row: ScheduleRow): SchedulePayload {
  return {
    createdAt: row.created_at,
    cronExpr: row.cron_expr,
    enabled: row.enabled,
    id: row.id,
    lastRunAt: row.last_run_at,
    lastWorkflowRunId: row.last_workflow_run_id,
    name: row.name,
    nextRunAt: row.next_run_at,
    projectId: row.project_id,
    triggerPayloadTemplate: row.trigger_payload_template,
    triggerTarget: row.trigger_target,
    updatedAt: row.updated_at,
    workflowId: row.workflow_id,
  };
}

function getScheduleRow(sqlite: Database, scheduleId: string) {
  const row = getDrizzleDb(sqlite)
    .select({
      id: projectSchedulesTable.id,
      project_id: projectSchedulesTable.projectId,
      workflow_id: projectSchedulesTable.workflowId,
      name: projectSchedulesTable.name,
      cron_expr: projectSchedulesTable.cronExpr,
      trigger_target: projectSchedulesTable.triggerTarget,
      trigger_payload_template: projectSchedulesTable.triggerPayloadTemplate,
      enabled: projectSchedulesTable.enabled,
      last_run_at: projectSchedulesTable.lastRunAt,
      next_run_at: projectSchedulesTable.nextRunAt,
      last_workflow_run_id: projectSchedulesTable.lastWorkflowRunId,
      created_at: projectSchedulesTable.createdAt,
      updated_at: projectSchedulesTable.updatedAt,
    })
    .from(projectSchedulesTable)
    .where(
      and(
        eq(projectSchedulesTable.id, scheduleId),
        isNull(projectSchedulesTable.deletedAt),
      ),
    )
    .get() as ScheduleRow | undefined;

  if (!row) {
    throwScheduleNotFound(scheduleId);
  }

  return row;
}

export async function createSchedule(
  sqlite: Database,
  input: CreateScheduleInput,
): Promise<SchedulePayload> {
  await getProjectById(sqlite, input.projectId);
  await getWorkflowById(sqlite, input.workflowId);

  if (!validateCronExpr(input.cronExpr)) {
    throwInvalidCronExpr(input.cronExpr);
  }

  const now = new Date().toISOString();
  const scheduleId = createScheduleId();
  const nextRunAt = getNextRunTime(input.cronExpr);

  getDrizzleDb(sqlite)
    .insert(projectSchedulesTable)
    .values({
      id: scheduleId,
      projectId: input.projectId,
      workflowId: input.workflowId,
      name: input.name,
      cronExpr: input.cronExpr,
      triggerTarget: 'workflow',
      triggerPayloadTemplate: input.triggerPayloadTemplate ?? null,
      enabled: input.enabled !== false,
      lastRunAt: null,
      nextRunAt,
      lastWorkflowRunId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  return getScheduleById(sqlite, scheduleId);
}

export async function listProjectSchedules(
  sqlite: Database,
  projectId: string,
): Promise<ScheduleListPayload> {
  await getProjectById(sqlite, projectId);

  const rows = getDrizzleDb(sqlite)
    .select({
      id: projectSchedulesTable.id,
      project_id: projectSchedulesTable.projectId,
      workflow_id: projectSchedulesTable.workflowId,
      name: projectSchedulesTable.name,
      cron_expr: projectSchedulesTable.cronExpr,
      trigger_target: projectSchedulesTable.triggerTarget,
      trigger_payload_template: projectSchedulesTable.triggerPayloadTemplate,
      enabled: projectSchedulesTable.enabled,
      last_run_at: projectSchedulesTable.lastRunAt,
      next_run_at: projectSchedulesTable.nextRunAt,
      last_workflow_run_id: projectSchedulesTable.lastWorkflowRunId,
      created_at: projectSchedulesTable.createdAt,
      updated_at: projectSchedulesTable.updatedAt,
    })
    .from(projectSchedulesTable)
    .where(
      and(
        eq(projectSchedulesTable.projectId, projectId),
        isNull(projectSchedulesTable.deletedAt),
      ),
    )
    .orderBy(desc(projectSchedulesTable.updatedAt), desc(projectSchedulesTable.createdAt))
    .all() as ScheduleRow[];

  return {
    items: rows.map(mapScheduleRow),
    projectId,
  };
}

export async function getScheduleById(
  sqlite: Database,
  scheduleId: string,
): Promise<SchedulePayload> {
  return mapScheduleRow(getScheduleRow(sqlite, scheduleId));
}

export async function tickDueSchedules(
  sqlite: Database,
  now = new Date(),
): Promise<TickSchedulesResult> {
  const dueRows = getDrizzleDb(sqlite)
    .select({
      id: projectSchedulesTable.id,
      project_id: projectSchedulesTable.projectId,
      workflow_id: projectSchedulesTable.workflowId,
      name: projectSchedulesTable.name,
      cron_expr: projectSchedulesTable.cronExpr,
      trigger_target: projectSchedulesTable.triggerTarget,
      trigger_payload_template: projectSchedulesTable.triggerPayloadTemplate,
      enabled: projectSchedulesTable.enabled,
      last_run_at: projectSchedulesTable.lastRunAt,
      next_run_at: projectSchedulesTable.nextRunAt,
      last_workflow_run_id: projectSchedulesTable.lastWorkflowRunId,
      created_at: projectSchedulesTable.createdAt,
      updated_at: projectSchedulesTable.updatedAt,
    })
    .from(projectSchedulesTable)
    .where(
      and(
        eq(projectSchedulesTable.enabled, true),
        lte(projectSchedulesTable.nextRunAt, now.toISOString()),
        isNull(projectSchedulesTable.deletedAt),
      ),
    )
    .orderBy(asc(projectSchedulesTable.nextRunAt), asc(projectSchedulesTable.createdAt))
    .all() as ScheduleRow[];

  const firedScheduleIds: string[] = [];
  const workflowRunIds: string[] = [];

  for (const row of dueRows) {
    const schedule = mapScheduleRow(row);
    const result = await triggerWorkflow(sqlite, schedule.workflowId, {
      triggerPayload: resolveTriggerPayload(schedule),
      triggerSource: 'schedule',
    });
    await upsertExternalKanbanCard(sqlite, {
      ...buildScheduleKanbanCard(schedule),
      projectId: schedule.projectId,
    });
    const nextRunAt = getNextRunTime(schedule.cronExpr, now);
    const updatedAt = new Date().toISOString();

    getDrizzleDb(sqlite)
      .update(projectSchedulesTable)
      .set({
        lastRunAt: now.toISOString(),
        nextRunAt,
        lastWorkflowRunId: result.workflowRun.id,
        updatedAt,
      })
      .where(
        and(
          eq(projectSchedulesTable.id, schedule.id),
          isNull(projectSchedulesTable.deletedAt),
        ),
      )
      .run();

    firedScheduleIds.push(schedule.id);
    workflowRunIds.push(result.workflowRun.id);
  }

  return {
    firedScheduleIds,
    workflowRunIds,
  };
}
