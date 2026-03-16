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
  buildTaskOrchestrationEventContext,
  createTaskOrchestrationEvent,
  taskOrchestrationEventNames,
} from './task-orchestration-events';
import {
  getTaskDispatchability,
  listDispatchableTasks,
  resolveTaskDispatchPolicy,
  type TaskDispatchability,
} from './task-dispatch-policy-service';
import {
  getTaskById,
  updateTask,
} from './task-service';

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
  callerSessionId?: string;
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
  callerSessionId?: string;
  limit?: number;
  projectId: string;
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
      createTaskOrchestrationEvent(
        taskOrchestrationEventNames.dispatchBlocked,
        buildTaskOrchestrationEventContext(initialTask, input, options, {
          provider: initialTask.assignedProvider,
        }),
        {
          reason: 'TASK_ALREADY_DISPATCHING',
        },
      ),
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
    const policy = await resolveTaskDispatchPolicy(
      sqlite,
      {
        callbacks,
        callerSessionId: input.callerSessionId,
        runtimeProfile,
        task: initialTask,
      },
    );
    const dispatchability = policy.dispatchability;

    if (!policy.dispatchable || !policy.resolvedRole) {
      logDiagnostic(
        options.logger,
        'info',
        createTaskOrchestrationEvent(
          taskOrchestrationEventNames.dispatchBlocked,
          buildTaskOrchestrationEventContext(
            dispatchability.task,
            input,
            options,
            {
              provider: dispatchability.task.assignedProvider,
              role: dispatchability.resolvedRole,
              specialistId: dispatchability.task.assignedSpecialistId,
            },
          ),
          {
            reason: 'TASK_NOT_DISPATCHABLE',
          unresolvedDependencyIds: dispatchability.unresolvedDependencyIds,
          blockReasons: dispatchability.reasons,
          },
        ),
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
    const dispatchContext = policy.dispatchContext;
    const providerCandidates = policy.providerCandidates;
    const preferredProvider = policy.preferredProvider;
    const provider = policy.resolvedProvider;

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
        createTaskOrchestrationEvent(
          taskOrchestrationEventNames.dispatchProviderFallback,
          buildTaskOrchestrationEventContext(
            dispatchability.task,
            input,
            options,
            {
              provider,
              role: policy.resolvedRole,
              specialistId: policy.resolvedSpecialist?.id ?? null,
            },
          ),
          {
            fromProvider: preferredProvider,
          triedProviders: providerCandidates,
          },
        ),
        'Task dispatch degraded to an available ACP provider',
      );
    }
    const specialist = policy.resolvedSpecialist;

    if (!dispatchContext || !specialist) {
      throw new Error('Dispatch policy resolved an incomplete dispatch plan');
    }

    const hydratedTask = await hydrateTaskAssignment(
      sqlite,
      dispatchability.task,
      policy.resolvedRole,
      specialist,
      provider,
    );
    const prompt = buildTaskDispatchPrompt(hydratedTask);

    logDiagnostic(
      options.logger,
      'info',
      createTaskOrchestrationEvent(
        taskOrchestrationEventNames.dispatchAttempt,
        buildTaskOrchestrationEventContext(hydratedTask, input, options, {
          provider,
          role: policy.resolvedRole,
          specialistId: specialist.id,
        }),
      ),
      'Dispatching task to a child ACP session',
    );

    dispatchPhase = 'create_session';
    const createdSession = await callbacks.createSession({
      actorUserId: dispatchContext.actorUserId,
      goal: hydratedTask.title,
      parentSessionId: dispatchContext.parentSessionId,
      projectId: hydratedTask.projectId,
      provider,
      retryOfRunId: input.retryOfRunId,
      role: policy.resolvedRole,
      specialistId: specialist.id,
      taskId: hydratedTask.id,
    });
    const dispatchedTask = await updateTask(sqlite, hydratedTask.id, {
      triggerSessionId: createdSession.id,
    });

    dispatchPhase = 'prompt_session';
    await callbacks.promptSession({
      projectId: dispatchedTask.projectId,
      prompt,
      sessionId: createdSession.id,
    });

    logDiagnostic(
      options.logger,
      'info',
      createTaskOrchestrationEvent(
        taskOrchestrationEventNames.dispatchSucceeded,
        buildTaskOrchestrationEventContext(dispatchedTask, input, options, {
          provider,
          role: policy.resolvedRole,
          specialistId: specialist.id,
        }),
        {
        sessionId: createdSession.id,
        },
      ),
      'Task dispatch completed successfully',
    );

    return {
      dispatchability: {
        ...dispatchability,
        task: dispatchedTask,
      },
      dispatched: true,
      prompt,
      provider,
      reason: null,
      role: policy.resolvedRole,
      sessionId: createdSession.id,
      specialistId: specialist.id,
      task: dispatchedTask,
    };
  } catch (error) {
    const diagnostics = getErrorDiagnostics(error, 'TASK_DISPATCH_FAILED');

    logDiagnostic(
      options.logger,
      'error',
      createTaskOrchestrationEvent(
        taskOrchestrationEventNames.dispatchFailed,
        buildTaskOrchestrationEventContext(initialTask, input, options),
        {
        ...diagnostics,
        },
      ),
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
    },
    {
      orchestrationMode: runtimeProfile.orchestrationMode,
    },
  );
  const limit = input.limit ?? candidates.length;
  const results: DispatchTaskResult[] = [];

  for (const candidate of candidates.slice(0, limit)) {
    results.push(
      await dispatchTask(
        sqlite,
        callbacks,
        {
          callerSessionId: input.callerSessionId,
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
