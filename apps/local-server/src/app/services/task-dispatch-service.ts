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
import { registerDelegationGroupSession } from './delegation-group-service';
import {
  getTaskSessionAssignment,
  listDispatchableTaskSessions,
  resolveTaskSessionAssignment,
  type TaskSessionAssignment,
} from './task-session-assignment-service';
import { getProjectWorktreeById } from './project-worktree-service';
import {
  getTaskById,
  updateTask,
} from './task-service';

export interface DispatchTaskCallbacks {
  createSession(input: {
    actorUserId: string;
    codebaseId?: string | null;
    cwd?: string | null;
    delegationGroupId?: string | null;
    goal?: string;
    parentSessionId?: string | null;
    parentTaskId?: string | null;
    projectId: string;
    provider: string;
    retryOfRunId?: string | null;
    role?: string | null;
    specialistId?: string;
    taskId?: string | null;
    waveId?: string | null;
    worktreeId?: string | null;
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
  delegationGroupId?: string | null;
  parentTaskId?: string | null;
  retryOfRunId?: string | null;
  taskId: string;
  waveId?: string | null;
}

export interface DispatchTaskResult {
  delegationGroupId: string | null;
  dispatchability: TaskSessionAssignment;
  dispatched: boolean;
  parentTaskId: string | null;
  prompt: string | null;
  provider: string | null;
  reason: 'TASK_ALREADY_DISPATCHING' | 'TASK_NOT_DISPATCHABLE' | null;
  role: RoleValue | null;
  sessionId: string | null;
  specialistId: string | null;
  task: TaskPayload;
  waveId: string | null;
}

export interface DispatchTasksInput {
  callerSessionId?: string;
  delegationGroupId?: string | null;
  limit?: number;
  parentTaskId?: string | null;
  projectId: string;
  taskIds?: string[];
  waveId?: string | null;
}

export interface DispatchTasksResult {
  delegationGroupId: string | null;
  dispatchedCount: number;
  results: DispatchTaskResult[];
  waveId: string | null;
}

export interface DispatchTaskOptions {
  logger?: DiagnosticLogger;
  source?: string;
  triggerReason?: string | null;
  triggerSource?: string | null;
}

const activeDispatchClaims = new Set<string>();
const activeDispatchWaveClaims = new Set<string>();

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

function resolveDispatchMetadata(input: DispatchTaskInput, task: TaskPayload) {
  return {
    delegationGroupId: input.delegationGroupId ?? task.parallelGroup ?? null,
    parentTaskId: input.parentTaskId ?? task.parentTaskId ?? null,
    waveId: input.waveId ?? null,
  };
}

function buildWaveClaimKey(input: DispatchTasksInput) {
  if (input.waveId?.trim()) {
    return input.waveId.trim();
  }

  if (input.delegationGroupId?.trim()) {
    return input.delegationGroupId.trim();
  }

  return null;
}

function tryClaimWaveDispatch(claimKey: string | null) {
  if (!claimKey) {
    return false;
  }

  if (activeDispatchWaveClaims.has(claimKey)) {
    return true;
  }

  activeDispatchWaveClaims.add(claimKey);
  return false;
}

function releaseWaveDispatchClaim(claimKey: string | null) {
  if (!claimKey) {
    return;
  }

  activeDispatchWaveClaims.delete(claimKey);
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

async function resolveTaskDispatchWorkspace(
  sqlite: Database,
  task: TaskPayload,
) {
  if (!task.worktreeId) {
    return {
      codebaseId: task.codebaseId,
      cwd: null,
      worktreeId: null,
    };
  }

  const worktree = await getProjectWorktreeById(
    sqlite,
    task.projectId,
    task.worktreeId,
  );

  return {
    codebaseId: worktree.codebaseId,
    cwd: worktree.worktreePath,
    worktreeId: worktree.id,
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
    const metadata = resolveDispatchMetadata(input, initialTask);

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
      delegationGroupId: metadata.delegationGroupId,
      dispatchability: await getTaskSessionAssignment(sqlite, initialTask.id),
      dispatched: false,
      parentTaskId: metadata.parentTaskId,
      prompt: null,
      provider: initialTask.assignedProvider,
      reason: 'TASK_ALREADY_DISPATCHING',
      role: null,
      sessionId: null,
      specialistId: null,
      task: initialTask,
      waveId: metadata.waveId,
    };
  }

  try {
    const runtimeProfile = await getProjectRuntimeProfile(
      sqlite,
      initialTask.projectId,
    );
    const policy = await resolveTaskSessionAssignment(
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
      const metadata = resolveDispatchMetadata(input, dispatchability.task);

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
        delegationGroupId: metadata.delegationGroupId,
        dispatchability,
        dispatched: false,
        parentTaskId: metadata.parentTaskId,
        prompt: null,
        provider: dispatchability.task.assignedProvider,
        reason: 'TASK_NOT_DISPATCHABLE',
        role: dispatchability.resolvedRole,
        sessionId: null,
        specialistId: dispatchability.task.assignedSpecialistId,
        task: dispatchability.task,
        waveId: metadata.waveId,
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
    const workspace = await resolveTaskDispatchWorkspace(sqlite, hydratedTask);
    const prompt = buildTaskDispatchPrompt(hydratedTask);
    const metadata = resolveDispatchMetadata(input, hydratedTask);

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
      codebaseId: workspace.codebaseId,
      cwd: workspace.cwd,
      delegationGroupId: metadata.delegationGroupId,
      goal: hydratedTask.title,
      parentSessionId: dispatchContext.parentSessionId,
      parentTaskId: metadata.parentTaskId,
      projectId: hydratedTask.projectId,
      provider,
      retryOfRunId: input.retryOfRunId,
      role: policy.resolvedRole,
      specialistId: specialist.id,
      taskId: hydratedTask.id,
      waveId: metadata.waveId,
      worktreeId: workspace.worktreeId,
    });
    const dispatchedTask = await updateTask(sqlite, hydratedTask.id, {
      triggerSessionId: createdSession.id,
    });
    if (dispatchedTask.parallelGroup) {
      await registerDelegationGroupSession(sqlite, {
        groupId: dispatchedTask.parallelGroup,
        sessionId: createdSession.id,
        taskId: dispatchedTask.id,
      });
    }

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
      delegationGroupId: metadata.delegationGroupId,
      dispatchability: {
        ...dispatchability,
        task: dispatchedTask,
      },
      dispatched: true,
      parentTaskId: metadata.parentTaskId,
      prompt,
      provider,
      reason: null,
      role: policy.resolvedRole,
      sessionId: createdSession.id,
      specialistId: specialist.id,
      task: dispatchedTask,
      waveId: metadata.waveId,
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
  const waveClaimKey = buildWaveClaimKey(input);
  const duplicateWaveDispatch = tryClaimWaveDispatch(waveClaimKey);
  const limit = input.limit;
  const taskIds = input.taskIds
    ? [...new Set(input.taskIds.map((taskId) => taskId.trim()))].filter(Boolean)
    : null;
  const runtimeProfile = await getProjectRuntimeProfile(
    sqlite,
    input.projectId,
  );

  if (duplicateWaveDispatch && taskIds) {
    const claimedResults = await Promise.all(
      taskIds.slice(0, limit ?? taskIds.length).map(async (taskId) => {
        const task = await getTaskById(sqlite, taskId);
        const metadata = resolveDispatchMetadata(
          {
            callerSessionId: input.callerSessionId,
            delegationGroupId: input.delegationGroupId,
            parentTaskId: input.parentTaskId,
            taskId,
            waveId: input.waveId,
          },
          task,
        );

        return {
          delegationGroupId: metadata.delegationGroupId,
          dispatchability: await getTaskSessionAssignment(sqlite, task.id, {
            orchestrationMode: runtimeProfile.orchestrationMode,
          }),
          dispatched: false,
          parentTaskId: metadata.parentTaskId,
          prompt: null,
          provider: task.assignedProvider,
          reason: 'TASK_ALREADY_DISPATCHING' as const,
          role: task.assignedRole,
          sessionId: null,
          specialistId: task.assignedSpecialistId,
          task,
          waveId: metadata.waveId,
        };
      }),
    );

    return {
      delegationGroupId: input.delegationGroupId ?? null,
      dispatchedCount: 0,
      results: claimedResults,
      waveId: input.waveId ?? null,
    };
  }

  try {
    const candidates = taskIds
      ? (
          await Promise.all(
            taskIds.map(async (taskId) => {
              const task = await getTaskById(sqlite, taskId);

              if (task.projectId !== input.projectId) {
                throw new ProblemError({
                  type: 'https://team-ai.dev/problems/task-project-mismatch',
                  title: 'Task Project Mismatch',
                  status: 409,
                  detail:
                    `Task ${task.id} does not belong to project ${input.projectId}`,
                });
              }

              return {
                dispatchable: await getTaskSessionAssignment(sqlite, task.id, {
                  orchestrationMode: runtimeProfile.orchestrationMode,
                }),
                task,
              };
            }),
          )
        ).map((entry) => entry.dispatchable)
      : await listDispatchableTaskSessions(
          sqlite,
          {
            projectId: input.projectId,
          },
          {
            orchestrationMode: runtimeProfile.orchestrationMode,
          },
        );
    const boundedCandidates = candidates.slice(0, limit ?? candidates.length);
    const results: DispatchTaskResult[] = [];

    for (const candidate of boundedCandidates) {
      results.push(
        await dispatchTask(
          sqlite,
          callbacks,
          {
            callerSessionId: input.callerSessionId,
            delegationGroupId:
              input.delegationGroupId ?? candidate.task.parallelGroup ?? null,
            parentTaskId:
              input.parentTaskId ?? candidate.task.parentTaskId ?? null,
            taskId: candidate.task.id,
            waveId: input.waveId,
          },
          options,
        ),
      );
    }

    return {
      delegationGroupId: input.delegationGroupId ?? null,
      dispatchedCount: results.filter((result) => result.dispatched).length,
      results,
      waveId: input.waveId ?? null,
    };
  } finally {
    releaseWaveDispatchClaim(waveClaimKey);
  }
}

export function resetTaskDispatchClaimsForTest() {
  activeDispatchClaims.clear();
  activeDispatchWaveClaims.clear();
}
