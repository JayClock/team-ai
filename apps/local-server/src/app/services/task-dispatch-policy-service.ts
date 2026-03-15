import type { Database } from 'better-sqlite3';
import { ProblemError } from '../errors/problem-error';
import type { ProjectRuntimeProfilePayload } from '../schemas/runtime-profile';
import type { RoleValue } from '../schemas/role';
import type { SpecialistPayload } from '../schemas/specialist';
import type { TaskPayload } from '../schemas/task';
import {
  getDefaultSpecialistByRole,
  getSpecialistById,
} from './specialist-service';
import {
  getTaskDispatchability,
  type TaskDispatchability,
} from './task-service';
import type { DispatchTaskCallbacks } from './task-dispatch-service';

interface TaskCallerSessionRow {
  actor_id: string;
  id: string;
  project_id: string;
  provider: string;
}

export interface TaskDispatchContext {
  actorUserId: string;
  callerSessionId: string | null;
  parentSessionId: string | null;
  provider: string | null;
}

interface ResolveTaskDispatchPolicyInput {
  callerSessionId?: string;
  callbacks: Pick<DispatchTaskCallbacks, 'isProviderAvailable'>;
  runtimeProfile: Pick<
    ProjectRuntimeProfilePayload,
    'defaultProviderId' | 'orchestrationMode'
  >;
  task: TaskPayload;
}

export interface TaskDispatchPolicyDecision {
  blockReasons: TaskDispatchability['reasons'];
  dispatchContext: TaskDispatchContext | null;
  dispatchability: TaskDispatchability;
  dispatchable: boolean;
  preferredProvider: string | null;
  providerCandidates: string[];
  resolvedProvider: string | null;
  resolvedRole: RoleValue | null;
  resolvedSpecialist: SpecialistPayload | null;
}

const defaultTaskDispatchActorId = 'desktop-user';

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

function resolveTaskDispatchContext(
  sqlite: Database,
  task: Pick<TaskPayload, 'projectId' | 'sessionId'>,
  callerSessionId?: string,
): TaskDispatchContext {
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
    actorUserId: defaultTaskDispatchActorId,
    callerSessionId: null,
    parentSessionId: null,
    provider: null,
  };
}

function resolveDispatchProviderCandidates(
  task: Pick<TaskPayload, 'assignedProvider'>,
  dispatchContext: Pick<TaskDispatchContext, 'provider'>,
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
  callbacks: Pick<DispatchTaskCallbacks, 'isProviderAvailable'>,
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

export async function resolveTaskDispatchPolicy(
  sqlite: Database,
  input: ResolveTaskDispatchPolicyInput,
): Promise<TaskDispatchPolicyDecision> {
  const dispatchability = await getTaskDispatchability(sqlite, input.task.id, {
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

  const dispatchContext = resolveTaskDispatchContext(
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

  const providerCandidates = resolveDispatchProviderCandidates(
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
