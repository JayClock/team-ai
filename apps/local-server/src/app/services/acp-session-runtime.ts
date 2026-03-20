import type { Database } from 'better-sqlite3';
import type { PromptResponse } from '@agentclientprotocol/sdk';
import { customAlphabet } from 'nanoid';
import { and, eq, isNull } from 'drizzle-orm';
import {
  buildBootstrapPrompt,
  getErrorDiagnostics,
  logDiagnostic,
  ProblemError,
  normalizeAcpProviderId,
  resolveLocalMcpServers,
  resolveSessionCwd,
} from '@orchestration/runtime-acp';
import type {
  AcpRuntimeClient,
  AcpRuntimeSessionHooks,
  AcpRuntimeSessionSnapshot,
  AcpSessionPayload,
  AcpSessionState,
  AcpStreamBroker,
  AcpSupervisionPolicyPayload,
  AcpTimeoutScopePayload,
  DiagnosticLogger,
} from '@orchestration/runtime-acp';
import { getDrizzleDb } from '../db/drizzle';
import {
  projectAcpSessionsTable,
  projectWorktreesTable,
} from '../db/schema';
import { createAgent, updateAgent } from './agent-service';
import {
  appendLifecycleEvent,
  appendLocalEvent,
  appendPromptRequestedEvents,
  appendSupervisionEvent,
  createCanonicalUpdate,
  createRuntimeHooks,
} from './acp-session-events';
import {
  buildAcpSessionReplayPrompt,
  getSessionAgentPrompt,
  sessionHasPromptHistory,
} from './acp-session-history';
import {
  flushAcpSessionEventWriteBuffer,
} from './acp-session-event-write-buffer';
import {
  calculateIsoDeadline,
  cloneDefaultSupervisionPolicy,
  getSessionRow,
  mapSessionRow,
  resolveSupervisionPolicy,
  updateSessionRuntime,
} from './acp-session-store';
import {
  enforceStepBudgetIfNeeded,
  resolveLifecycleFailureState,
  resolveTimeoutLifecycleState,
} from './acp-session-supervision';
import {
  classifyTaskExecutionFailure,
  getTaskExecutionRow,
  recordTaskExecutionCreationFailure,
  syncTaskExecutionOutcome,
  type TaskExecutionRow,
  updateTaskExecutionState,
} from './acp-session-task-sync';
import { getProjectCodebaseById } from './project-codebase-service';
import {
  getProjectRuntimeProfile,
  resolveProjectRuntimeRoleDefault,
} from './project-runtime-profile-service';
import { getProjectById } from './project-service';
import { getProjectWorktreeById } from './project-worktree-service';
import {
  ensureRoleValue,
  getDefaultSpecialistByRole,
  getSpecialistById,
  renderSpecialistSystemPrompt,
  throwSpecialistRoleMismatch,
} from './specialist-service';
import { startTaskRun } from './task-run-service';

const sessionIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

export interface CreateSessionInput {
  actorUserId: string;
  codebaseId?: string | null;
  cwd?: string | null;
  delegationGroupId?: string | null;
  goal?: string;
  model?: string | null;
  parentSessionId?: string | null;
  parentTaskId?: string | null;
  projectId: string;
  provider?: string | null;
  retryOfRunId?: string | null;
  role?: string | null;
  specialistId?: string;
  taskId?: string | null;
  waveId?: string | null;
  worktreeId?: string | null;
}

export interface PromptSessionInput {
  eventId?: string;
  prompt: string;
  supervision?: Partial<AcpSupervisionPolicyPayload>;
  traceId?: string;
}

export interface AcpServiceOptions {
  logger?: DiagnosticLogger;
  source?: string;
}

function createSessionId() {
  return `acps_${sessionIdGenerator()}`;
}

function throwSessionNotFound(sessionId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/acp-session-not-found',
    title: 'ACP Session Not Found',
    status: 404,
    detail: `ACP session ${sessionId} was not found`,
  });
}

function throwTaskProjectMismatch(projectId: string, taskId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-project-mismatch',
    title: 'Task Project Mismatch',
    status: 409,
    detail: `Task ${taskId} does not belong to project ${projectId}`,
  });
}

function throwTaskRoleMismatch(
  taskId: string,
  requestedRole: string,
  expectedRole: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-role-mismatch',
    title: 'Task Role Mismatch',
    status: 409,
    detail: `Task ${taskId} is assigned to role ${expectedRole}, not ${requestedRole}`,
  });
}

function throwSessionWorktreeCodebaseMismatch(
  projectId: string,
  codebaseId: string,
  worktreeId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/session-worktree-codebase-mismatch',
    title: 'Session Worktree Codebase Mismatch',
    status: 409,
    detail: `Worktree ${worktreeId} does not belong to codebase ${codebaseId} in project ${projectId}`,
    context: {
      codebaseId,
      projectId,
      worktreeId,
    },
  });
}

function throwTaskWorkspaceMismatch(
  taskId: string,
  field: 'codebaseId' | 'worktreeId',
  expected: string,
  received: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-session-workspace-mismatch',
    title: 'Task Session Workspace Mismatch',
    status: 409,
    detail: `Task ${taskId} requires ${field} ${expected}, but session creation requested ${received}`,
    context: {
      expected,
      field,
      received,
      taskId,
    },
  });
}

function throwSessionProviderNotConfigured(projectId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/acp-session-provider-not-configured',
    title: 'ACP Session Provider Not Configured',
    status: 409,
    detail:
      `Project ${projectId} does not have a provider for ACP session creation. ` +
      'Set a role-based provider in project settings or pass provider explicitly.',
  });
}

async function resolveAcpSessionDefaults(
  sqlite: Database,
  input: {
    model?: string | null;
    projectId: string;
    provider?: string | null;
    role?: string | null;
  },
): Promise<{
  orchestrationMode: 'ROUTA' | 'DEVELOPER';
  model: string | null;
  provider: string;
}> {
  const runtimeProfile = await getProjectRuntimeProfile(
    sqlite,
    input.projectId,
  );
  const resolvedRole =
    ensureRoleValue(input.role ?? null) ??
    resolveDefaultAcpSessionRole(runtimeProfile.orchestrationMode);
  const roleDefault = resolveProjectRuntimeRoleDefault(
    runtimeProfile,
    resolvedRole,
  );
  const providerId =
    normalizeOptionalText(input.provider) ??
    normalizeOptionalText(roleDefault?.providerId);

  if (!providerId) {
    throwSessionProviderNotConfigured(input.projectId);
  }

  return {
    orchestrationMode: runtimeProfile.orchestrationMode,
    model:
      normalizeOptionalText(input.model) ??
      normalizeOptionalText(roleDefault?.model),
    provider: normalizeAcpProviderId(providerId),
  };
}

function resolveDefaultAcpSessionRole(
  orchestrationMode: 'ROUTA' | 'DEVELOPER',
) {
  return orchestrationMode === 'DEVELOPER' ? 'DEVELOPER' : 'ROUTA';
}

async function resolveSessionWorkspaceBinding(
  sqlite: Database,
  projectId: string,
  projectRepoPath: string | null,
  input: {
    codebaseId?: string | null;
    cwd?: string | null;
    task: TaskExecutionRow | null;
    worktreeId?: string | null;
  },
) {
  if (
    input.task?.codebase_id &&
    input.codebaseId &&
    input.codebaseId !== input.task.codebase_id
  ) {
    throwTaskWorkspaceMismatch(
      input.task.id,
      'codebaseId',
      input.task.codebase_id,
      input.codebaseId,
    );
  }

  if (
    input.task?.worktree_id &&
    input.worktreeId &&
    input.worktreeId !== input.task.worktree_id
  ) {
    throwTaskWorkspaceMismatch(
      input.task.id,
      'worktreeId',
      input.task.worktree_id,
      input.worktreeId,
    );
  }

  let codebaseId = input.codebaseId ?? input.task?.codebase_id ?? null;
  const worktreeId = input.worktreeId ?? input.task?.worktree_id ?? null;
  let worktreePath: string | null = null;

  if (worktreeId) {
    const worktree = await getProjectWorktreeById(
      sqlite,
      projectId,
      worktreeId,
    );

    if (codebaseId && codebaseId !== worktree.codebaseId) {
      throwSessionWorktreeCodebaseMismatch(projectId, codebaseId, worktreeId);
    }

    codebaseId = worktree.codebaseId;
    worktreePath = worktree.worktreePath;
  }

  if (codebaseId) {
    await getProjectCodebaseById(sqlite, projectId, codebaseId);
  }

  return {
    codebaseId,
    cwd: resolveSessionCwd(worktreePath ?? input.cwd ?? projectRepoPath),
    worktreeId,
  };
}

function assignSessionToWorktree(
  sqlite: Database,
  projectId: string,
  worktreeId: string,
  sessionId: string,
) {
  getDrizzleDb(sqlite)
    .update(projectWorktreesTable)
    .set({
      sessionId,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(projectWorktreesTable.id, worktreeId),
        eq(projectWorktreesTable.projectId, projectId),
        isNull(projectWorktreesTable.deletedAt),
      ),
    )
    .run();
}

async function createTaskExecutionRun(
  sqlite: Database,
  input: {
    projectId: string;
    provider: string;
    retryOfRunId?: string | null;
    role?: string | null;
    sessionId: string;
    specialistId?: string | null;
    taskId: string;
  },
  options: AcpServiceOptions = {},
) {
  return await startTaskRun(
    sqlite,
    {
      projectId: input.projectId,
      provider: input.provider,
      retryOfRunId: input.retryOfRunId,
      role: input.role,
      sessionId: input.sessionId,
      specialistId: input.specialistId,
      status: 'RUNNING',
      taskId: input.taskId,
    },
    {
      logger: options.logger,
      reason: 'task_execution_session_created',
      source: options.source ?? 'acp-service',
    },
  );
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveFailureMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function createRuntimeEventCallbacks() {
  return {
    enforceStepBudgetIfNeeded: (
      sqlite: Database,
      broker: AcpStreamBroker,
      runtime: AcpRuntimeClient,
      sessionId: string,
      options: AcpServiceOptions = {},
    ) =>
      enforceStepBudgetIfNeeded(
        sqlite,
        broker,
        runtime,
        sessionId,
        {
          ensureRuntimeLoaded,
          syncTaskExecutionOutcome,
        },
        options,
      ),
    syncTaskExecutionOutcome,
  };
}

async function recreateAcpSessionRuntime(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  sessionId: string,
  nextConfig: {
    model: string | null;
    provider: string;
  },
  options: AcpServiceOptions = {},
): Promise<AcpRuntimeSessionSnapshot> {
  const session = getSessionRow(sqlite, sessionId);
  await flushAcpSessionEventWriteBuffer(sqlite, sessionId);
  const replayPrompt = buildAcpSessionReplayPrompt(
    sqlite,
    sessionId,
    nextConfig,
  );
  const baseHooks = createRuntimeHooks(
    sqlite,
    broker,
    runtime,
    sessionId,
    createRuntimeEventCallbacks(),
    options,
  );
  let muteUpdates = replayPrompt !== null;
  const hooks: AcpRuntimeSessionHooks = {
    onClosed: baseHooks.onClosed,
    async onSessionUpdate(update) {
      if (muteUpdates) {
        return;
      }

      await baseHooks.onSessionUpdate(update);
    },
  };

  await runtime.killSession(sessionId);

  try {
    const created = await runtime.createSession({
      localSessionId: sessionId,
      model: nextConfig.model,
      provider: nextConfig.provider,
      cwd: session.cwd ?? '',
      mcpServers: resolveLocalMcpServers(),
      hooks,
    });

    if (replayPrompt) {
      await runtime.promptSession({
        localSessionId: sessionId,
        prompt: replayPrompt,
        provider: nextConfig.provider,
      });
    }

    muteUpdates = false;
    return created;
  } catch (error) {
    muteUpdates = false;
    await runtime.killSession(sessionId);
    throw error;
  }
}

async function updateSessionFromPromptResponse(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  sessionId: string,
  response: PromptResponse,
  options: AcpServiceOptions = {},
) {
  const session = getSessionRow(sqlite, sessionId);
  let state: AcpSessionState = 'RUNNING';
  const timedOutScope = session.timeout_scope;
  if (response.stopReason === 'cancelled' && timedOutScope) {
    state = 'FAILED';
  } else if (response.stopReason === 'cancelled') {
    state = 'CANCELLED';
  }

  const completedAt = new Date().toISOString();
  appendLocalEvent(sqlite, broker, {
    sessionId,
    update: createCanonicalUpdate(
      sessionId,
      getSessionRow(sqlite, sessionId).provider,
      'turn_complete',
      {
        turnComplete: {
          stopReason: response.stopReason,
          usage: response.usage ?? null,
          userMessageId: response.userMessageId ?? null,
          ...((state === 'CANCELLED' || state === 'FAILED') ? { state } : {}),
        },
      },
    ),
  });

  updateSessionRuntime(sqlite, sessionId, {
    acpStatus: 'ready',
    acpError: null,
    state,
    failureReason:
      state === 'FAILED' && timedOutScope
        ? `ACP session timed out (${timedOutScope})`
        : null,
    completedAt: state === 'RUNNING' ? null : completedAt,
    lastActivityAt: completedAt,
  });

  if (state === 'RUNNING') {
    await enforceStepBudgetIfNeeded(
      sqlite,
      broker,
      runtime,
      sessionId,
      {
        ensureRuntimeLoaded,
        syncTaskExecutionOutcome,
      },
      options,
    );
  }

  const updatedSession = getSessionRow(sqlite, sessionId);

  if (state === 'FAILED' && timedOutScope) {
    appendLifecycleEvent(sqlite, broker, {
      detail: `ACP session timed out (${timedOutScope})`,
      sessionId,
      state: resolveTimeoutLifecycleState(timedOutScope),
      taskBound: session.task_id !== null,
    });
  } else if (
    state !== 'CANCELLED' &&
    updatedSession.state !== 'CANCELLING'
  ) {
    appendLifecycleEvent(sqlite, broker, {
      detail: response.stopReason,
      sessionId,
      state: session.task_id ? 'completed' : 'idle',
      taskBound: session.task_id !== null,
    });
  }

  await syncTaskExecutionOutcome(
    sqlite,
    sessionId,
    updatedSession.state === 'CANCELLING'
      ? 'FAILED'
      : state === 'FAILED'
      ? 'FAILED'
      : state === 'CANCELLED'
        ? 'CANCELLED'
        : 'COMPLETED',
    updatedSession.state === 'CANCELLING'
      ? updatedSession.failure_reason
      : undefined,
    options,
  );
}

export async function ensureRuntimeLoaded(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  sessionId: string,
  options: AcpServiceOptions = {},
): Promise<string> {
  const session = getSessionRow(sqlite, sessionId);
  if (runtime.isSessionActive(sessionId) && session.runtime_session_id) {
    return session.runtime_session_id;
  }

  if (!session.runtime_session_id) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-runtime-missing',
      title: 'ACP Runtime Missing',
      status: 409,
      detail: `ACP session ${sessionId} does not have a runtime session id`,
    });
  }

  const loaded = await runtime.loadSession({
    localSessionId: session.id,
    model: session.model,
    runtimeSessionId: session.runtime_session_id,
    provider: session.provider,
    cwd: session.cwd ?? '',
    mcpServers: resolveLocalMcpServers(),
    hooks: createRuntimeHooks(
      sqlite,
      broker,
      runtime,
      session.id,
      createRuntimeEventCallbacks(),
      options,
    ),
  });

  if (loaded.runtimeSessionId !== session.runtime_session_id) {
    updateSessionRuntime(sqlite, sessionId, {
      runtimeSessionId: loaded.runtimeSessionId,
    });
    return loaded.runtimeSessionId;
  }

  return session.runtime_session_id;
}

export async function createAcpSession(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  input: CreateSessionInput,
  options: AcpServiceOptions = {},
): Promise<AcpSessionPayload> {
  const { model, orchestrationMode, provider } =
    await resolveAcpSessionDefaults(sqlite, input);
  const project = await getProjectById(sqlite, input.projectId);
  const parentSession = input.parentSessionId
    ? getSessionRow(sqlite, input.parentSessionId)
    : null;
  const task = input.taskId ? getTaskExecutionRow(sqlite, input.taskId) : null;
  const shouldInheritParentWorkspace =
    parentSession !== null &&
    !input.codebaseId &&
    !input.cwd &&
    !input.worktreeId &&
    !task?.codebase_id &&
    !task?.worktree_id;

  if (task && task.project_id !== input.projectId) {
    throwTaskProjectMismatch(input.projectId, task.id);
  }

  const requestedRole = ensureRoleValue(input.role);
  const taskRole = ensureRoleValue(task?.assigned_role);

  if (taskRole && requestedRole && taskRole !== requestedRole) {
    throwTaskRoleMismatch(
      input.taskId ?? 'unknown-task',
      requestedRole,
      taskRole,
    );
  }

  const role =
    taskRole ??
    requestedRole ??
    resolveDefaultAcpSessionRole(orchestrationMode);
  let specialist = input.specialistId
    ? await getSpecialistById(sqlite, input.projectId, input.specialistId)
    : null;

  if (!specialist && task?.assigned_specialist_id) {
    specialist = await getSpecialistById(
      sqlite,
      input.projectId,
      task.assigned_specialist_id,
    );
  }

  if (specialist && role && specialist.role !== role) {
    throwSpecialistRoleMismatch(specialist.id, role, specialist.role);
  }

  if (!specialist && role) {
    specialist = await getDefaultSpecialistByRole(
      sqlite,
      input.projectId,
      role,
    );
  }

  const workspaceBinding = await resolveSessionWorkspaceBinding(
    sqlite,
    input.projectId,
    project.repoPath ?? null,
    {
      codebaseId:
        input.codebaseId ??
        (shouldInheritParentWorkspace ? parentSession?.codebase_id : null),
      cwd:
        input.cwd ??
        (shouldInheritParentWorkspace ? parentSession?.cwd : null),
      task,
      worktreeId:
        input.worktreeId ??
        (shouldInheritParentWorkspace ? parentSession?.worktree_id : null),
    },
  );
  const now = new Date().toISOString();
  const sessionId = createSessionId();
  const supervisionPolicy = cloneDefaultSupervisionPolicy();
  const agent = specialist
    ? await createAgent(sqlite, {
        projectId: input.projectId,
        name: specialist.name,
        role: specialist.role,
        provider,
        model: model ?? specialist.modelTier ?? 'default',
        systemPrompt: renderSpecialistSystemPrompt(specialist),
        specialistId: specialist.id,
        parentAgentId: parentSession?.agent_id ?? null,
      })
    : null;

  getDrizzleDb(sqlite)
    .insert(projectAcpSessionsTable)
    .values({
      id: sessionId,
      projectId: input.projectId,
      agentId: agent?.id ?? null,
      actorId: input.actorUserId,
      codebaseId: workspaceBinding.codebaseId,
      parentSessionId: input.parentSessionId ?? null,
      specialistId: specialist?.id ?? null,
      name: input.goal?.trim() || null,
      model,
      provider,
      cwd: workspaceBinding.cwd,
      worktreeId: workspaceBinding.worktreeId,
      taskId: input.taskId ?? null,
      acpStatus: 'connecting',
      acpError: null,
      supervisionPolicyJson: JSON.stringify(supervisionPolicy),
      deadlineAt: null,
      inactiveDeadlineAt: null,
      cancelRequestedAt: null,
      cancelledAt: null,
      forceKilledAt: null,
      timeoutScope: null,
      stepCount: 0,
      state: 'PENDING',
      runtimeSessionId: null,
      failureReason: null,
      lastEventId: null,
      startedAt: now,
      lastActivityAt: now,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  if (workspaceBinding.worktreeId) {
    assignSessionToWorktree(
      sqlite,
      input.projectId,
      workspaceBinding.worktreeId,
      sessionId,
    );
  }

  try {
    const runtimeSession = await runtime.createSession({
      localSessionId: sessionId,
      model,
      orchestration: {
        delegationGroupId: input.delegationGroupId ?? null,
        parentTaskId: input.parentTaskId ?? null,
        taskId: task?.id ?? input.taskId ?? null,
        waveId: input.waveId ?? null,
      },
      provider,
      cwd: workspaceBinding.cwd,
      mcpServers: resolveLocalMcpServers(),
      hooks: createRuntimeHooks(
        sqlite,
        broker,
        runtime,
        sessionId,
        createRuntimeEventCallbacks(),
        options,
      ),
    });

    updateSessionRuntime(sqlite, sessionId, {
      runtimeSessionId: runtimeSession.runtimeSessionId,
      acpStatus: 'ready',
      acpError: null,
      state: 'PENDING',
      startedAt: now,
      lastActivityAt: now,
    });

    if (task) {
      await createTaskExecutionRun(
        sqlite,
        {
          projectId: input.projectId,
          provider,
          retryOfRunId: input.retryOfRunId,
          role,
          sessionId,
          specialistId: specialist?.id ?? null,
          taskId: task.id,
        },
        options,
      );
      updateTaskExecutionState(sqlite, {
        taskId: task.id,
        executionSessionId: sessionId,
        resultSessionId: null,
        completionSummary: null,
        verificationReport: null,
        verificationVerdict: null,
        status: 'RUNNING',
      });
    }
  } catch (error) {
    const message = resolveFailureMessage(error, 'ACP session creation failed');
    const recovery = classifyTaskExecutionFailure(error, 'session_create');
    const diagnostics = getErrorDiagnostics(error);

    logDiagnostic(
      options.logger,
      'error',
      {
        event: 'acp.session.create.failed',
        localSessionId: sessionId,
        projectId: input.projectId,
        retryOfRunId: input.retryOfRunId ?? null,
        source: options.source ?? 'acp-service',
        taskId: task?.id ?? null,
        ...diagnostics,
      },
      'ACP session creation failed',
    );

    appendLocalEvent(sqlite, broker, {
      sessionId,
      update: createCanonicalUpdate(sessionId, provider, 'error', {
        error: {
          code: recovery.errorCode,
          message,
        },
      }),
      error: {
        code: recovery.errorCode,
        message,
        retryable: recovery.retryable,
        retryAfterMs: recovery.retryAfterMs,
      },
    });
    updateSessionRuntime(sqlite, sessionId, {
      acpStatus: 'error',
      acpError: message,
      state: 'FAILED',
      failureReason: message,
      completedAt: now,
      lastActivityAt: now,
    });

    if (task) {
      await recordTaskExecutionCreationFailure(
        sqlite,
        {
          completedAt: now,
          message,
          projectId: input.projectId,
          provider,
          retryOfRunId: input.retryOfRunId,
          role,
          sessionId,
          source: options.source,
          specialistId: specialist?.id ?? null,
          taskId: task.id,
        },
        options,
      );
      updateTaskExecutionState(sqlite, {
        taskId: task.id,
        executionSessionId: null,
        resultSessionId: sessionId,
        completionSummary: message,
        verificationReport: message,
        verificationVerdict: 'fail',
        status: recovery.taskStatus,
      });
    }

    throw error;
  }

  return mapSessionRow(getSessionRow(sqlite, sessionId));
}

export async function renameAcpSession(
  sqlite: Database,
  sessionId: string,
  name: string,
): Promise<AcpSessionPayload> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-session-name-invalid',
      title: 'ACP Session Name Invalid',
      status: 400,
      detail: 'ACP session name must not be blank',
    });
  }

  getSessionRow(sqlite, sessionId);
  getDrizzleDb(sqlite)
    .update(projectAcpSessionsTable)
    .set({
      name: trimmedName,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projectAcpSessionsTable.id, sessionId))
    .run();

  return mapSessionRow(getSessionRow(sqlite, sessionId));
}

export async function updateAcpSession(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  projectId: string,
  sessionId: string,
  input: {
    model?: string | null;
    name?: string;
    provider?: string;
  },
  options: AcpServiceOptions = {},
): Promise<AcpSessionPayload> {
  const current = getSessionRow(sqlite, sessionId);
  if (current.project_id !== projectId) {
    throwSessionNotFound(sessionId);
  }

  const nextName =
    input.name === undefined ? current.name : input.name.trim() || null;
  const nextProvider =
    input.provider === undefined
      ? current.provider
      : normalizeAcpProviderId(input.provider);
  const providerChanged = nextProvider !== current.provider;
  const nextModel =
    input.model === undefined
      ? providerChanged
        ? null
        : current.model
      : normalizeOptionalText(input.model);

  if (input.name !== undefined && !nextName) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-session-name-invalid',
      title: 'ACP Session Name Invalid',
      status: 400,
      detail: 'ACP session name must not be blank',
    });
  }

  const modelChanged = nextModel !== current.model;
  const nameChanged = nextName !== current.name;
  const runtimeConfigChanged = providerChanged || modelChanged;

  if (!runtimeConfigChanged && !nameChanged) {
    return mapSessionRow(getSessionRow(sqlite, sessionId));
  }

  let runtimeSession: AcpRuntimeSessionSnapshot | null = null;
  if (runtimeConfigChanged) {
    runtimeSession = await recreateAcpSessionRuntime(
      sqlite,
      broker,
      runtime,
      sessionId,
      {
        model: nextModel,
        provider: nextProvider,
      },
      options,
    );
  }

  const now = new Date().toISOString();
  getDrizzleDb(sqlite)
    .update(projectAcpSessionsTable)
    .set({
      acpError: runtimeConfigChanged ? null : current.acp_error,
      acpStatus: runtimeConfigChanged ? 'ready' : current.acp_status,
      completedAt: runtimeConfigChanged ? null : current.completed_at,
      failureReason: runtimeConfigChanged ? null : current.failure_reason,
      lastActivityAt: runtimeConfigChanged ? now : current.last_activity_at,
      model: nextModel,
      name: nextName,
      provider: nextProvider,
      runtimeSessionId:
        runtimeSession?.runtimeSessionId ?? current.runtime_session_id,
      state: runtimeConfigChanged ? 'PENDING' : current.state,
      updatedAt: now,
    })
    .where(eq(projectAcpSessionsTable.id, sessionId))
    .run();

  if (current.agent_id && (providerChanged || modelChanged)) {
    await updateAgent(sqlite, projectId, current.agent_id, {
      provider: nextProvider,
      model: nextModel ?? 'default',
    });
  }

  return mapSessionRow(getSessionRow(sqlite, sessionId));
}

export async function deleteAcpSession(
  sqlite: Database,
  runtime: AcpRuntimeClient,
  sessionId: string,
): Promise<void> {
  getSessionRow(sqlite, sessionId);
  await runtime.killSession(sessionId);
  const now = new Date().toISOString();
  getDrizzleDb(sqlite)
    .update(projectAcpSessionsTable)
    .set({
      deletedAt: now,
      updatedAt: now,
    })
    .where(eq(projectAcpSessionsTable.id, sessionId))
    .run();
}

export async function loadAcpSession(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  projectId: string,
  sessionId: string,
  options: AcpServiceOptions = {},
): Promise<AcpSessionPayload> {
  const session = getSessionRow(sqlite, sessionId);
  if (session.project_id !== projectId) {
    throwSessionNotFound(sessionId);
  }

  if (session.runtime_session_id && !runtime.isSessionActive(sessionId)) {
    const loaded = await runtime.loadSession({
      localSessionId: session.id,
      model: session.model,
      runtimeSessionId: session.runtime_session_id,
      provider: session.provider,
      cwd: session.cwd ?? '',
      mcpServers: resolveLocalMcpServers(),
      hooks: createRuntimeHooks(
        sqlite,
        broker,
        runtime,
        session.id,
        createRuntimeEventCallbacks(),
        options,
      ),
    });

    if (loaded.runtimeSessionId !== session.runtime_session_id) {
      updateSessionRuntime(sqlite, sessionId, {
        acpStatus: 'ready',
        acpError: null,
        runtimeSessionId: loaded.runtimeSessionId,
      });
    }
  }

  return mapSessionRow(getSessionRow(sqlite, sessionId));
}

export async function promptAcpSession(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  projectId: string,
  sessionId: string,
  input: PromptSessionInput,
  options: AcpServiceOptions = {},
) {
  const session = getSessionRow(sqlite, sessionId);
  if (session.project_id !== projectId) {
    throwSessionNotFound(sessionId);
  }

  const supervisionPolicy = resolveSupervisionPolicy(input.supervision);
  const startedAt = session.started_at ?? new Date().toISOString();
  const lastActivityAt = new Date().toISOString();
  const deadlineAt = calculateIsoDeadline(
    session.started_at,
    supervisionPolicy.totalTimeoutMs,
  );
  const inactiveDeadlineAt = new Date(
    Date.parse(lastActivityAt) + supervisionPolicy.inactivityTimeoutMs,
  ).toISOString();

  await flushAcpSessionEventWriteBuffer(sqlite, sessionId);

  const systemPrompt = getSessionAgentPrompt(sqlite, session);
  const bootstrapPrompt = sessionHasPromptHistory(sqlite, sessionId)
    ? null
    : systemPrompt;
  const effectivePrompt = bootstrapPrompt
    ? buildBootstrapPrompt(bootstrapPrompt, input.prompt)
    : input.prompt;

  await ensureRuntimeLoaded(sqlite, broker, runtime, sessionId, options);
  appendPromptRequestedEvents(
    sqlite,
    broker,
    sessionId,
    session.provider,
    input.prompt,
    input.eventId,
  );
  appendSupervisionEvent(sqlite, broker, {
    sessionId,
    stage: 'policy_resolved',
    policy: supervisionPolicy,
    detail: 'Resolved session supervision policy for prompt execution.',
  });
  updateSessionRuntime(sqlite, sessionId, {
    acpStatus: 'ready',
    acpError: null,
    state: 'RUNNING',
    failureReason: null,
    completedAt: null,
    startedAt,
    lastActivityAt,
    deadlineAt,
    inactiveDeadlineAt,
    cancelRequestedAt: null,
    cancelledAt: null,
    forceKilledAt: null,
    timeoutScope: null,
    supervisionPolicy,
  });

  try {
    const runtimeResult = await runtime.promptSession({
      localSessionId: sessionId,
      prompt: effectivePrompt,
      provider: session.provider,
      eventId: input.eventId,
      timeoutMs: supervisionPolicy.promptTimeoutMs,
      traceId: input.traceId,
    });

    await updateSessionFromPromptResponse(
      sqlite,
      broker,
      runtime,
      sessionId,
      runtimeResult.response,
      options,
    );

    return {
      session: mapSessionRow(getSessionRow(sqlite, sessionId)),
      runtime: {
        provider: session.provider,
        sessionId: runtimeResult.runtimeSessionId,
        stopReason: runtimeResult.response.stopReason,
      },
    };
  } catch (error) {
    const message = resolveFailureMessage(error, 'ACP prompt execution failed');
    const recovery = classifyTaskExecutionFailure(error, 'prompt');
    const timeoutScope: AcpTimeoutScopePayload | null =
      error instanceof ProblemError &&
      error.type === 'https://team-ai.dev/problems/acp-prompt-timeout'
        ? ((typeof error.context?.timeoutScope === 'string'
            ? error.context.timeoutScope
            : 'prompt') as AcpTimeoutScopePayload)
        : error instanceof ProblemError &&
            error.type ===
              'https://team-ai.dev/problems/acp-provider-initialize-timeout'
          ? 'provider_initialize'
          : null;
    appendLocalEvent(sqlite, broker, {
      sessionId,
      update: createCanonicalUpdate(sessionId, session.provider, 'error', {
        error: {
          code: recovery.errorCode,
          message,
        },
      }),
      error: {
        code: recovery.errorCode,
        message,
        retryable: recovery.retryable,
        retryAfterMs: recovery.retryAfterMs,
      },
    });
    if (timeoutScope) {
      options.logger?.warn?.(
        {
          detail: message,
          model: session.model,
          provider: session.provider,
          scope: timeoutScope,
          sessionId,
          source: options.source ?? 'acp-service',
          stage: 'timeout_detected',
          taskBound: session.task_id !== null,
        },
        'ACP session supervision transition',
      );
      appendSupervisionEvent(sqlite, broker, {
        sessionId,
        stage: 'timeout_detected',
        scope: timeoutScope,
        policy: supervisionPolicy,
        detail: message,
      });
    }
    updateSessionRuntime(sqlite, sessionId, {
      acpStatus: 'error',
      acpError: message,
      state: 'FAILED',
      failureReason: message,
      completedAt: new Date().toISOString(),
      timeoutScope,
      supervisionPolicy,
    });
    appendLifecycleEvent(sqlite, broker, {
      detail: message,
      sessionId,
      state: resolveLifecycleFailureState(error),
      taskBound: session.task_id !== null,
    });

    await syncTaskExecutionOutcome(
      sqlite,
      sessionId,
      'FAILED',
      message,
      options,
      recovery.taskStatus,
    );

    throw error;
  }
}

export async function cancelAcpSession(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  projectId: string,
  sessionId: string,
  reason?: string,
  options: AcpServiceOptions = {},
) {
  const session = getSessionRow(sqlite, sessionId);
  if (session.project_id !== projectId) {
    throwSessionNotFound(sessionId);
  }

  if (session.runtime_session_id && !runtime.isSessionActive(sessionId)) {
    await ensureRuntimeLoaded(sqlite, broker, runtime, sessionId, options);
  }

  if (session.runtime_session_id && runtime.isSessionActive(sessionId)) {
    await runtime.cancelSession({
      localSessionId: sessionId,
      reason,
    });
  }

  appendLocalEvent(sqlite, broker, {
    sessionId,
    update: createCanonicalUpdate(
      sessionId,
      session.provider,
      'turn_complete',
      {
        turnComplete: {
          stopReason: 'cancelled',
          usage: null,
          userMessageId: null,
          state: 'CANCELLED',
        },
      },
    ),
  });
  updateSessionRuntime(sqlite, sessionId, {
    acpStatus: 'ready',
    acpError: null,
    state: 'CANCELLED',
    completedAt: new Date().toISOString(),
    failureReason: reason ?? null,
  });

  await syncTaskExecutionOutcome(
    sqlite,
    sessionId,
    'CANCELLED',
    reason ?? null,
    options,
  );

  return mapSessionRow(getSessionRow(sqlite, sessionId));
}
