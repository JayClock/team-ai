import type { Database } from 'better-sqlite3';
import {
  getErrorDiagnostics,
  logDiagnostic,
  type DiagnosticLogger,
} from '../diagnostics';
import { ProblemError } from '../errors/problem-error';
import type { RoleValue } from '../schemas/role';
import type { SpecialistPayload } from '../schemas/specialist';
import type { TaskPayload } from '../schemas/task';
import { getProjectRuntimeProfile } from './project-runtime-profile-service';
import {
  getDefaultSpecialistByRole,
  getSpecialistById,
} from './specialist-service';
import {
  getTaskById,
  getTaskDispatchability,
  listDispatchableTasks,
  updateTask,
  type TaskDispatchability,
} from './task-service';

interface TaskTriggerSessionRow {
  actor_id: string;
  id: string;
  project_id: string;
  provider: string;
}

export interface DispatchTaskCallbacks {
  createSession(input: {
    actorUserId: string;
    goal?: string;
    parentSessionId?: string | null;
    projectId: string;
    provider: string;
    retryOfRunId?: string | null;
    role?: string | null;
    specialistId?: string;
    taskId?: string | null;
  }): Promise<{ id: string }>;
  isProviderAvailable?(provider: string): Promise<boolean> | boolean;
  promptSession(input: {
    projectId: string;
    prompt: string;
    sessionId: string;
  }): Promise<unknown>;
}

export interface DispatchTaskInput {
  sessionId: string;
  retryOfRunId?: string | null;
  taskId: string;
}

export interface DispatchTaskResult {
  dispatchability: TaskDispatchability;
  dispatched: boolean;
  prompt: string | null;
  provider: string | null;
  reason: 'TASK_ALREADY_DISPATCHING' | 'TASK_NOT_DISPATCHABLE' | null;
  role: RoleValue | null;
  sessionId: string | null;
  specialistId: string | null;
  task: TaskPayload;
}

export interface DispatchTasksInput {
  limit?: number;
  projectId: string;
  sessionId?: string;
}

export interface DispatchTasksResult {
  dispatchedCount: number;
  results: DispatchTaskResult[];
}

export interface DispatchTaskOptions {
  logger?: DiagnosticLogger;
  source?: string;
  triggerReason?: string | null;
  triggerSource?: string | null;
}

const activeDispatchClaims = new Set<string>();

function tryClaimTaskDispatch(taskId: string) {
  if (activeDispatchClaims.has(taskId)) {
    return false;
  }

  activeDispatchClaims.add(taskId);
  return true;
}

function releaseTaskDispatchClaim(taskId: string) {
  activeDispatchClaims.delete(taskId);
}

function getTriggerSessionRow(
  sqlite: Database,
  sessionId: string,
): TaskTriggerSessionRow {
  const row = sqlite
    .prepare(
      `
        SELECT id, project_id, actor_id, provider
        FROM project_acp_sessions
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(sessionId) as TaskTriggerSessionRow | undefined;

  if (!row) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/task-dispatch-trigger-session-missing',
      title: 'Task Dispatch Trigger Session Missing',
      status: 409,
      detail: `Task dispatch trigger session ${sessionId} is not available`,
      context: {
        sessionId,
      },
    });
  }

  return row;
}

function resolveDispatchProvider(
  task: Pick<TaskPayload, 'assignedProvider'>,
  triggerSession: Pick<TaskTriggerSessionRow, 'provider'>,
  defaultProviderId: string | null,
) {
  return [
    task.assignedProvider,
    triggerSession.provider,
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
  callbacks: DispatchTaskCallbacks,
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

function buildTaskDispatchPrompt(task: TaskPayload) {
  const sections = [`Task: ${task.title}`, `Objective:\n${task.objective}`];

  if (task.scope?.trim()) {
    sections.push(`Scope:\n${task.scope.trim()}`);
  }

  if (task.acceptanceCriteria.length > 0) {
    sections.push(
      `Acceptance Criteria:\n${task.acceptanceCriteria.map((item) => `- ${item}`).join('\n')}`,
    );
  }

  if (task.verificationCommands.length > 0) {
    sections.push(
      `Verification Commands:\n${task.verificationCommands
        .map((command) => `- ${command}`)
        .join('\n')}`,
    );
  }

  if (task.dependencies.length > 0) {
    sections.push(
      `Dependencies:\n${task.dependencies.map((dependency) => `- ${dependency}`).join('\n')}`,
    );
  }

  sections.push(
    'Keep the work scoped to this task, then report the outcome and validation clearly.',
  );

  return sections.join('\n\n');
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

async function hydrateTaskAssignment(
  sqlite: Database,
  task: TaskPayload,
  role: RoleValue,
  specialist: SpecialistPayload,
  provider: string,
): Promise<TaskPayload> {
  const patch: Parameters<typeof updateTask>[2] = {};

  if (task.assignedRole !== role) {
    patch.assignedRole = role;
  }

  if (task.assignedSpecialistId !== specialist.id) {
    patch.assignedSpecialistId = specialist.id;
  }

  if (task.assignedSpecialistName !== specialist.name) {
    patch.assignedSpecialistName = specialist.name;
  }

  if (task.assignedProvider !== provider) {
    patch.assignedProvider = provider;
  }

  if (Object.keys(patch).length === 0) {
    return task;
  }

  return updateTask(sqlite, task.id, patch);
}

async function recoverTaskForRetry(
  sqlite: Database,
  taskId: string,
  message: string,
) {
  return updateTask(sqlite, taskId, {
    completionSummary: message,
    executionSessionId: null,
    resultSessionId: null,
    status: 'WAITING_RETRY',
    verificationReport: message,
    verificationVerdict: 'fail',
  });
}

function buildDispatchLogContext(
  task: Pick<
    TaskPayload,
    'executionSessionId' | 'id' | 'kind' | 'projectId' | 'status'
  >,
  input: Pick<DispatchTaskInput, 'sessionId'>,
  options: DispatchTaskOptions,
) {
  return {
    source: options.source ?? 'task-dispatch-service',
    taskExecutionSessionId: task.executionSessionId,
    taskId: task.id,
    taskKind: task.kind,
    taskStatus: task.status,
    triggerReason: options.triggerReason ?? null,
    triggerSessionId: input.sessionId,
    triggerSource: options.triggerSource ?? null,
    projectId: task.projectId,
  };
}

export async function dispatchTask(
  sqlite: Database,
  callbacks: DispatchTaskCallbacks,
  input: DispatchTaskInput,
  options: DispatchTaskOptions = {},
): Promise<DispatchTaskResult> {
  const initialTask = await getTaskById(sqlite, input.taskId);
  let dispatchPhase: 'prepare' | 'create_session' | 'prompt_session' =
    'prepare';

  if (!tryClaimTaskDispatch(initialTask.id)) {
    logDiagnostic(
      options.logger,
      'warn',
      {
        event: 'task.dispatch.blocked',
        reason: 'TASK_ALREADY_DISPATCHING',
        retryOfRunId: input.retryOfRunId ?? null,
        ...buildDispatchLogContext(initialTask, input, options),
      },
      'Task dispatch skipped because another attempt is active',
    );

    return {
      dispatchability: await getTaskDispatchability(sqlite, initialTask.id),
      dispatched: false,
      prompt: null,
      provider: initialTask.assignedProvider,
      reason: 'TASK_ALREADY_DISPATCHING',
      role: null,
      sessionId: null,
      specialistId: null,
      task: initialTask,
    };
  }

  try {
    const runtimeProfile = await getProjectRuntimeProfile(
      sqlite,
      initialTask.projectId,
    );
    const dispatchability = await getTaskDispatchability(
      sqlite,
      initialTask.id,
      {
        orchestrationMode: runtimeProfile.orchestrationMode,
      },
    );

    if (!dispatchability.dispatchable || !dispatchability.resolvedRole) {
      logDiagnostic(
        options.logger,
        'info',
        {
          event: 'task.dispatch.blocked',
          reason: 'TASK_NOT_DISPATCHABLE',
          resolvedRole: dispatchability.resolvedRole,
          retryOfRunId: input.retryOfRunId ?? null,
          unresolvedDependencyIds: dispatchability.unresolvedDependencyIds,
          blockReasons: dispatchability.reasons,
          ...buildDispatchLogContext(dispatchability.task, input, options),
        },
        'Task dispatch blocked by current task state',
      );

      return {
        dispatchability,
        dispatched: false,
        prompt: null,
        provider: dispatchability.task.assignedProvider,
        reason: 'TASK_NOT_DISPATCHABLE',
        role: dispatchability.resolvedRole,
        sessionId: null,
        specialistId: dispatchability.task.assignedSpecialistId,
        task: dispatchability.task,
      };
    }

    const triggerSession = getTriggerSessionRow(
      sqlite,
      input.sessionId,
    );

    if (triggerSession.project_id !== dispatchability.task.projectId) {
      throw new ProblemError({
        type: 'https://team-ai.dev/problems/task-dispatch-trigger-session-mismatch',
        title: 'Task Dispatch Trigger Session Mismatch',
        status: 409,
        detail:
          `Task dispatch trigger session ${input.sessionId} does not belong to ` +
          `project ${dispatchability.task.projectId}`,
        context: {
          projectId: dispatchability.task.projectId,
          sessionId: input.sessionId,
          taskId: dispatchability.task.id,
        },
      });
    }
    const providerCandidates = resolveDispatchProvider(
      dispatchability.task,
      triggerSession,
      runtimeProfile.defaultProviderId,
    );
    const preferredProvider = providerCandidates[0] ?? null;
    const provider = await resolveAvailableDispatchProvider(
      callbacks,
      providerCandidates,
    );

    if (!provider) {
      const message =
        'Task dispatch could not start because no configured ACP provider is available ' +
        `for task ${dispatchability.task.id}. Tried: ${providerCandidates.join(', ')}`;

      await recoverTaskForRetry(sqlite, dispatchability.task.id, message);

      throw new ProblemError({
        type: 'https://team-ai.dev/problems/task-dispatch-provider-unavailable',
        title: 'Task Dispatch Provider Unavailable',
        status: 503,
        detail: message,
        context: {
          providerCandidates,
          taskId: dispatchability.task.id,
        },
      });
    }

    if (preferredProvider && provider !== preferredProvider) {
      logDiagnostic(
        options.logger,
        'info',
        {
          event: 'task.dispatch.provider_fallback',
          fromProvider: preferredProvider,
          provider,
          retryOfRunId: input.retryOfRunId ?? null,
          triedProviders: providerCandidates,
          ...buildDispatchLogContext(dispatchability.task, input, options),
        },
        'Task dispatch degraded to an available ACP provider',
      );
    }

    const specialist = await resolveDispatchSpecialist(
      sqlite,
      dispatchability.task,
      dispatchability.resolvedRole,
    );
    const hydratedTask = await hydrateTaskAssignment(
      sqlite,
      dispatchability.task,
      dispatchability.resolvedRole,
      specialist,
      provider,
    );
    const prompt = buildTaskDispatchPrompt(hydratedTask);

    logDiagnostic(
      options.logger,
      'info',
      {
        event: 'task.dispatch.attempt',
        provider,
        resolvedRole: dispatchability.resolvedRole,
        retryOfRunId: input.retryOfRunId ?? null,
        specialistId: specialist.id,
        ...buildDispatchLogContext(hydratedTask, input, options),
      },
      'Dispatching task to a child ACP session',
    );

    dispatchPhase = 'create_session';
    const createdSession = await callbacks.createSession({
      actorUserId: triggerSession.actor_id,
      goal: hydratedTask.title,
      parentSessionId: triggerSession.id,
      projectId: hydratedTask.projectId,
      provider,
      retryOfRunId: input.retryOfRunId,
      role: dispatchability.resolvedRole,
      specialistId: specialist.id,
      taskId: hydratedTask.id,
    });

    dispatchPhase = 'prompt_session';
    await callbacks.promptSession({
      projectId: hydratedTask.projectId,
      prompt,
      sessionId: createdSession.id,
    });

    logDiagnostic(
      options.logger,
      'info',
      {
        event: 'task.dispatch.succeeded',
        provider,
        resolvedRole: dispatchability.resolvedRole,
        retryOfRunId: input.retryOfRunId ?? null,
        sessionId: createdSession.id,
        specialistId: specialist.id,
        ...buildDispatchLogContext(hydratedTask, input, options),
      },
      'Task dispatch completed successfully',
    );

    return {
      dispatchability: {
        ...dispatchability,
        task: hydratedTask,
      },
      dispatched: true,
      prompt,
      provider,
      reason: null,
      role: dispatchability.resolvedRole,
      sessionId: createdSession.id,
      specialistId: specialist.id,
      task: hydratedTask,
    };
  } catch (error) {
    const diagnostics = getErrorDiagnostics(error, 'TASK_DISPATCH_FAILED');

    logDiagnostic(
      options.logger,
      'error',
      {
        event: 'task.dispatch.failed',
        retryOfRunId: input.retryOfRunId ?? null,
        ...diagnostics,
        ...buildDispatchLogContext(initialTask, input, options),
      },
      'Task dispatch failed',
    );

    if (dispatchPhase === 'create_session') {
      const latestTask = await getTaskById(sqlite, initialTask.id).catch(
        () => initialTask,
      );

      if (
        latestTask.executionSessionId === null &&
        latestTask.status !== 'WAITING_RETRY' &&
        latestTask.status !== 'FAILED' &&
        latestTask.status !== 'CANCELLED'
      ) {
        await recoverTaskForRetry(
          sqlite,
          initialTask.id,
          diagnostics.errorMessage,
        );
      }
    }

    throw error;
  } finally {
    releaseTaskDispatchClaim(initialTask.id);
  }
}

export async function dispatchTasks(
  sqlite: Database,
  callbacks: DispatchTaskCallbacks,
  input: DispatchTasksInput,
  options: DispatchTaskOptions = {},
): Promise<DispatchTasksResult> {
  const runtimeProfile = await getProjectRuntimeProfile(
    sqlite,
    input.projectId,
  );
  const candidates = await listDispatchableTasks(
    sqlite,
    {
      projectId: input.projectId,
      sessionId: input.sessionId,
    },
    {
      orchestrationMode: runtimeProfile.orchestrationMode,
    },
  );
  const limit = input.limit ?? candidates.length;
  const results: DispatchTaskResult[] = [];

  for (const candidate of candidates.slice(0, limit)) {
    if (!input.sessionId) {
      throw new ProblemError({
        type: 'https://team-ai.dev/problems/task-dispatch-trigger-session-missing',
        title: 'Task Dispatch Trigger Session Missing',
        status: 409,
        detail: `Task ${candidate.task.id} cannot be dispatched without a parent session`,
        context: {
          projectId: input.projectId,
          taskId: candidate.task.id,
        },
      });
    }

    results.push(
      await dispatchTask(
        sqlite,
        callbacks,
        {
          sessionId: input.sessionId,
          taskId: candidate.task.id,
        },
        options,
      ),
    );
  }

  return {
    dispatchedCount: results.filter((result) => result.dispatched).length,
    results,
  };
}

export function resetTaskDispatchClaimsForTest() {
  activeDispatchClaims.clear();
}
