import type { Database } from 'better-sqlite3';
import { ProblemError } from '../errors/problem-error';
import type { ProjectRuntimeProfilePayload } from '../schemas/runtime-profile';
import type { RoleValue } from '../schemas/role';
import type { SpecialistPayload } from '../schemas/specialist';
import type { TaskKind, TaskPayload } from '../schemas/task';
import { getAcpSessionById } from './acp-service';
import { getProjectById } from './project-service';
import {
  ensureRoleValue,
  getDefaultSpecialistByRole,
  getSpecialistById,
} from './specialist-service';
import {
  getTaskById,
} from './task-service';
import type { TaskSessionDispatchCallbacks } from './task-session-dispatch-service';

interface TaskCallerSessionRow {
  actor_id: string;
  id: string;
  project_id: string;
  provider: string;
}

export interface TaskSessionContext {
  actorUserId: string;
  callerSessionId: string | null;
  parentSessionId: string | null;
  provider: string | null;
}

interface ResolveTaskSessionAssignmentInput {
  callerSessionId?: string;
  callbacks: Pick<TaskSessionDispatchCallbacks, 'isProviderAvailable'>;
  runtimeProfile: Pick<
    ProjectRuntimeProfilePayload,
    'defaultProviderId' | 'orchestrationMode'
  >;
  task: TaskPayload;
}

export type TaskSessionAssignmentBlockReason =
  | 'TASK_DEVELOPER_MODE_STAYS_IN_SESSION'
  | 'TASK_DEPENDENCIES_INCOMPLETE'
  | 'TASK_EXECUTION_ALREADY_ACTIVE'
  | 'TASK_KIND_NOT_DISPATCHABLE'
  | 'TASK_ROLE_NOT_RESOLVED'
  | 'TASK_STATUS_NOT_DISPATCHABLE';

export interface TaskSessionAssignment {
  dispatchable: boolean;
  reasons: TaskSessionAssignmentBlockReason[];
  resolvedRole: RoleValue | null;
  task: TaskPayload;
  unresolvedDependencyIds: string[];
}

interface TaskSessionAssignmentOptions {
  orchestrationMode?: ProjectRuntimeProfilePayload['orchestrationMode'];
}

interface ListDispatchableTasksQuery {
  projectId: string;
  sessionId?: string;
}

interface TaskDependencyStatusRow {
  id: string;
  status: string;
}

export interface TaskSessionAssignmentDecision {
  blockReasons: TaskSessionAssignment['reasons'];
  dispatchContext: TaskSessionContext | null;
  dispatchability: TaskSessionAssignment;
  dispatchable: boolean;
  preferredProvider: string | null;
  providerCandidates: string[];
  resolvedProvider: string | null;
  resolvedRole: RoleValue | null;
  resolvedSpecialist: SpecialistPayload | null;
}

export type TaskDispatchContext = TaskSessionContext;
export type TaskDispatchBlockReason = TaskSessionAssignmentBlockReason;
export type TaskDispatchability = TaskSessionAssignment;
export type TaskDispatchPolicyDecision = TaskSessionAssignmentDecision;

const defaultTaskSessionActorId = 'desktop-user';
const dispatchableTaskStatuses = new Set([
  'PENDING',
  'READY',
  'RUNNING',
  'WAITING_RETRY',
]);

function isTaskKindDispatchable(kind: TaskKind | null): boolean {
  return kind === 'implement' || kind === 'review' || kind === 'verify';
}

function isTaskStatusDispatchable(status: string): boolean {
  return dispatchableTaskStatuses.has(status);
}

export function resolveDefaultTaskSessionRole(
  kind: TaskKind | null,
  options: TaskSessionAssignmentOptions = {},
): RoleValue | null {
  if (options.orchestrationMode === 'DEVELOPER') {
    switch (kind) {
      case 'plan':
      case 'implement':
      case 'review':
      case 'verify':
        return 'DEVELOPER';
      default:
        return null;
    }
  }

  switch (kind) {
    case 'plan':
      return 'ROUTA';
    case 'review':
    case 'verify':
      return 'GATE';
    case 'implement':
      return 'CRAFTER';
    default:
      return null;
  }
}

async function resolveUnresolvedDependencyIds(
  sqlite: Database,
  task: Pick<TaskPayload, 'dependencies' | 'projectId'>,
): Promise<string[]> {
  const dependencyIds = [
    ...new Set(task.dependencies.map((id) => id.trim())),
  ].filter((id) => id.length > 0);

  if (dependencyIds.length === 0) {
    return [];
  }

  const placeholders = dependencyIds.map(() => '?').join(', ');
  const rows = sqlite
    .prepare(
      `
        SELECT id, status
        FROM project_tasks
        WHERE project_id = ?
          AND deleted_at IS NULL
          AND id IN (${placeholders})
      `,
    )
    .all(task.projectId, ...dependencyIds) as TaskDependencyStatusRow[];
  const statusById = new Map(rows.map((row) => [row.id, row.status]));

  return dependencyIds.filter((dependencyId) => {
    return statusById.get(dependencyId) !== 'COMPLETED';
  });
}

async function evaluateTaskSessionAssignment(
  sqlite: Database,
  task: TaskPayload,
  options: TaskSessionAssignmentOptions = {},
): Promise<TaskSessionAssignment> {
  const reasons: TaskSessionAssignmentBlockReason[] = [];

  if (!isTaskKindDispatchable(task.kind)) {
    reasons.push('TASK_KIND_NOT_DISPATCHABLE');
  }

  if (!isTaskStatusDispatchable(task.status)) {
    reasons.push('TASK_STATUS_NOT_DISPATCHABLE');
  }

  if (task.executionSessionId) {
    reasons.push('TASK_EXECUTION_ALREADY_ACTIVE');
  }

  const unresolvedDependencyIds = await resolveUnresolvedDependencyIds(
    sqlite,
    task,
  );
  if (unresolvedDependencyIds.length > 0) {
    reasons.push('TASK_DEPENDENCIES_INCOMPLETE');
  }

  const resolvedRole =
    ensureRoleValue(task.assignedRole) ??
    resolveDefaultTaskSessionRole(task.kind, {
      orchestrationMode: options.orchestrationMode,
    });

  if (
    options.orchestrationMode === 'DEVELOPER' &&
    isTaskKindDispatchable(task.kind) &&
    resolvedRole === 'DEVELOPER'
  ) {
    reasons.push('TASK_DEVELOPER_MODE_STAYS_IN_SESSION');
  }

  if (!resolvedRole && isTaskKindDispatchable(task.kind)) {
    reasons.push('TASK_ROLE_NOT_RESOLVED');
  }

  return {
    dispatchable: reasons.length === 0 && resolvedRole !== null,
    reasons,
    resolvedRole,
    task,
    unresolvedDependencyIds,
  };
}

export async function getTaskSessionAssignment(
  sqlite: Database,
  taskId: string,
  options: TaskSessionAssignmentOptions = {},
): Promise<TaskSessionAssignment> {
  const task = await getTaskById(sqlite, taskId);

  return await evaluateTaskSessionAssignment(sqlite, task, options);
}

export async function listDispatchableTaskSessions(
  sqlite: Database,
  query: ListDispatchableTasksQuery,
  options: TaskSessionAssignmentOptions = {},
): Promise<TaskSessionAssignment[]> {
  await getProjectById(sqlite, query.projectId);

  if (query.sessionId) {
    const session = await getAcpSessionById(sqlite, query.sessionId);
    if (session.project.id !== query.projectId) {
      throw new ProblemError({
        type: 'https://team-ai.dev/problems/task-session-project-mismatch',
        title: 'Task Session Project Mismatch',
        status: 409,
        detail: `Task project ${query.projectId} does not match session ${query.sessionId}`,
        context: {
          projectId: query.projectId,
          sessionId: query.sessionId,
        },
      });
    }
  }

  const filters = ['project_id = @projectId', 'deleted_at IS NULL'];
  const parameters: Record<string, unknown> = {
    projectId: query.projectId,
  };

  if (query.sessionId) {
    filters.push('session_id = @sessionId');
    parameters.sessionId = query.sessionId;
  }

  const rows = sqlite
    .prepare(
      `
        SELECT id
        FROM project_tasks
        WHERE ${filters.join(' AND ')}
        ORDER BY
          CASE priority
            WHEN 'high' THEN 0
            WHEN 'medium' THEN 1
            WHEN 'low' THEN 2
            ELSE 3
          END,
          created_at ASC,
          updated_at ASC
      `,
    )
    .all(parameters) as Array<{ id: string }>;

  const evaluations = await Promise.all(
    rows.map((row) => getTaskSessionAssignment(sqlite, row.id, options)),
  );

  return evaluations.filter((evaluation) => evaluation.dispatchable);
}

function findSessionRow(
  sqlite: Database,
  sessionId: string,
): TaskCallerSessionRow | null {
  return (
    (sqlite
      .prepare(
        `
        SELECT id, project_id, actor_id, provider
        FROM project_acp_sessions
        WHERE id = ? AND deleted_at IS NULL
      `,
      )
      .get(sessionId) as TaskCallerSessionRow | undefined) ?? null
  );
}

function getCallerSessionRow(
  sqlite: Database,
  sessionId: string,
): TaskCallerSessionRow {
  const row = findSessionRow(sqlite, sessionId);

  if (!row) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/task-dispatch-trigger-session-missing',
      title: 'Task Dispatch Caller Session Missing',
      status: 409,
      detail: `Task dispatch caller session ${sessionId} is not available`,
      context: {
        callerSessionId: sessionId,
      },
    });
  }

  return row;
}

function resolveTaskSessionContext(
  sqlite: Database,
  task: Pick<TaskPayload, 'projectId' | 'sessionId'>,
  callerSessionId?: string,
): TaskSessionContext {
  if (callerSessionId) {
    const callerSession = getCallerSessionRow(sqlite, callerSessionId);
    return {
      actorUserId: callerSession.actor_id,
      callerSessionId: callerSession.id,
      parentSessionId: callerSession.id,
      provider: callerSession.provider,
    };
  }

  if (task.sessionId) {
    const creatorSession = findSessionRow(sqlite, task.sessionId);
    if (creatorSession && creatorSession.project_id === task.projectId) {
      return {
        actorUserId: creatorSession.actor_id,
        callerSessionId: null,
        parentSessionId: null,
        provider: creatorSession.provider,
      };
    }
  }

  return {
    actorUserId: defaultTaskSessionActorId,
    callerSessionId: null,
    parentSessionId: null,
    provider: null,
  };
}

function resolveTaskSessionProviderCandidates(
  task: Pick<TaskPayload, 'assignedProvider'>,
  dispatchContext: Pick<TaskSessionContext, 'provider'>,
  defaultProviderId: string | null,
) {
  return [
    task.assignedProvider,
    dispatchContext.provider,
    defaultProviderId,
    'codex',
  ].filter((provider, index, providers): provider is string => {
    return (
      typeof provider === 'string' &&
      provider.trim().length > 0 &&
      providers.indexOf(provider) === index
    );
  });
}

async function resolveAvailableDispatchProvider(
  callbacks: Pick<TaskSessionDispatchCallbacks, 'isProviderAvailable'>,
  providers: string[],
): Promise<string | null> {
  for (const provider of providers) {
    if (!callbacks.isProviderAvailable) {
      return provider;
    }

    if (await callbacks.isProviderAvailable(provider)) {
      return provider;
    }
  }

  return null;
}

async function resolveDispatchSpecialist(
  sqlite: Database,
  task: TaskPayload,
  role: RoleValue,
): Promise<SpecialistPayload> {
  if (task.assignedSpecialistId) {
    return getSpecialistById(sqlite, task.projectId, task.assignedSpecialistId);
  }

  return getDefaultSpecialistByRole(sqlite, task.projectId, role);
}

export async function resolveTaskSessionAssignment(
  sqlite: Database,
  input: ResolveTaskSessionAssignmentInput,
): Promise<TaskSessionAssignmentDecision> {
  const dispatchability = await getTaskSessionAssignment(sqlite, input.task.id, {
    orchestrationMode: input.runtimeProfile.orchestrationMode,
  });

  if (!dispatchability.dispatchable || !dispatchability.resolvedRole) {
    return {
      blockReasons: dispatchability.reasons,
      dispatchContext: null,
      dispatchability,
      dispatchable: false,
      preferredProvider: dispatchability.task.assignedProvider,
      providerCandidates: [],
      resolvedProvider: dispatchability.task.assignedProvider,
      resolvedRole: dispatchability.resolvedRole,
      resolvedSpecialist: null,
    };
  }

  const dispatchContext = resolveTaskSessionContext(
    sqlite,
    dispatchability.task,
    input.callerSessionId,
  );

  if (
    input.callerSessionId &&
    dispatchContext.parentSessionId &&
    getCallerSessionRow(sqlite, dispatchContext.parentSessionId).project_id !==
      dispatchability.task.projectId
  ) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/task-dispatch-trigger-session-mismatch',
      title: 'Task Dispatch Caller Session Mismatch',
      status: 409,
      detail:
        `Task dispatch caller session ${input.callerSessionId} does not belong to ` +
        `project ${dispatchability.task.projectId}`,
      context: {
        callerSessionId: input.callerSessionId,
        projectId: dispatchability.task.projectId,
        taskId: dispatchability.task.id,
      },
    });
  }

  const providerCandidates = resolveTaskSessionProviderCandidates(
    dispatchability.task,
    dispatchContext,
    input.runtimeProfile.defaultProviderId,
  );
  const preferredProvider = providerCandidates[0] ?? null;
  const resolvedProvider = await resolveAvailableDispatchProvider(
    input.callbacks,
    providerCandidates,
  );
  const resolvedSpecialist = await resolveDispatchSpecialist(
    sqlite,
    dispatchability.task,
    dispatchability.resolvedRole,
  );

  return {
    blockReasons: dispatchability.reasons,
    dispatchContext,
    dispatchability,
    dispatchable: true,
    preferredProvider,
    providerCandidates,
    resolvedProvider,
    resolvedRole: dispatchability.resolvedRole,
    resolvedSpecialist,
  };
}

export const resolveTaskDispatchPolicy = resolveTaskSessionAssignment;
export const getTaskDispatchability = getTaskSessionAssignment;
export const listDispatchableTasks = listDispatchableTaskSessions;
export const resolveDefaultTaskRole = resolveDefaultTaskSessionRole;
