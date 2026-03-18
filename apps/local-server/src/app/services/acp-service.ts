import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import type { PromptResponse } from '@agentclientprotocol/sdk';
import {
  buildBootstrapPrompt,
  extractSessionMetadataFromNormalizedUpdate,
  getErrorDiagnostics,
  logDiagnostic,
  ProblemError,
  normalizeAcpProviderId,
  resolveLocalMcpServers,
  resolveSessionCwd,
  resolveSessionStateFromNormalizedUpdate,
} from '@orchestration/runtime-acp';
import type {
  AcpRuntimeClient,
  ManagedAcpSessionSnapshot,
  AcpRuntimeSessionSnapshot,
  AcpRuntimeSessionHooks,
  AcpStreamBroker,
  AcpEventEnvelopePayload,
  AcpEventErrorPayload,
  AcpLifecycleStatePayload,
  AcpOrchestrationEventName,
  AcpRuntimeSessionListPayload,
  AcpRuntimeSessionPayload,
  AcpEventUpdatePayload,
  AcpSessionListPayload,
  AcpSessionPayload,
  AcpSessionStatus,
  AcpSessionState,
  AcpSupervisionPolicyPayload,
  AcpTimeoutScopePayload,
  DiagnosticLogger,
  NormalizedSessionUpdate,
} from '@orchestration/runtime-acp';
import { createAgent, updateAgent } from './agent-service';
import { getProjectCodebaseById } from './project-codebase-service';
import { getProjectRuntimeProfile } from './project-runtime-profile-service';
import { getProjectById } from './project-service';
import { getProjectWorktreeById } from './project-worktree-service';
import {
  ensureRoleValue,
  getDefaultSpecialistByRole,
  getSpecialistById,
  renderSpecialistSystemPrompt,
  throwSpecialistRoleMismatch,
} from './specialist-service';
import { resolveProjectRuntimeRoleDefault } from './project-runtime-profile-service';
import {
  cancelTaskRun,
  completeTaskRun,
  failTaskRun,
  startTaskRun,
} from './task-run-service';
import {
  flushAcpSessionEventWriteBuffer,
  getAcpSessionEventWriteBuffer,
} from './acp-session-event-write-buffer';
import { recordAcpTrace } from './trace-service';

const sessionIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);
const eventIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  16,
);

interface AcpSessionRow {
  acp_error: string | null;
  acp_status: AcpSessionStatus;
  agent_id: string | null;
  actor_id: string;
  cancel_requested_at: string | null;
  cancelled_at: string | null;
  codebase_id: string | null;
  completed_at: string | null;
  cwd: string | null;
  deadline_at: string | null;
  failure_reason: string | null;
  force_killed_at: string | null;
  id: string;
  inactive_deadline_at: string | null;
  last_activity_at: string | null;
  last_event_id: string | null;
  model: string | null;
  name: string | null;
  parent_session_id: string | null;
  project_id: string;
  provider: string;
  runtime_session_id: string | null;
  specialist_id: string | null;
  started_at: string | null;
  step_count: number;
  state: AcpSessionState;
  task_id: string | null;
  supervision_policy_json: string;
  timeout_scope: AcpTimeoutScopePayload | null;
  worktree_id: string | null;
}

interface AcpEventRow {
  emitted_at: string;
  error_json: string | null;
  event_id: string;
  payload_json: string;
  session_id: string;
  type: string;
}

interface ListSessionsQuery {
  page: number;
  pageSize: number;
}

interface CreateSessionInput {
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

interface TaskExecutionRow {
  assigned_role: string | null;
  assigned_specialist_id: string | null;
  codebase_id: string | null;
  completion_summary: string | null;
  execution_session_id: string | null;
  id: string;
  kind: string | null;
  project_id: string;
  result_session_id: string | null;
  status: string;
  trigger_session_id: string | null;
  verification_report: string | null;
  verification_verdict: string | null;
  worktree_id: string | null;
}

interface TaskExecutionRunRow {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  task_id: string;
}

interface SessionHistorySummaryRow {
  error_json: string | null;
  payload_json: string;
  type: AcpEventUpdatePayload['eventType'];
}

export interface PromptSessionInput {
  eventId?: string;
  prompt: string;
  supervision?: Partial<AcpSupervisionPolicyPayload>;
  traceId?: string;
}

export const DEFAULT_ACP_SESSION_SUPERVISION_POLICY: AcpSupervisionPolicyPayload =
  {
    promptTimeoutMs: 300_000,
    inactivityTimeoutMs: 600_000,
    totalTimeoutMs: 1_800_000,
    cancelGraceMs: 1_000,
    completionGraceMs: 1_000,
    providerInitTimeoutMs: 10_000,
    packageManagerInitTimeoutMs: 120_000,
    maxSteps: 64,
    maxRetries: 0,
  };

export const DEFAULT_ACP_PROMPT_TIMEOUT_MS =
  DEFAULT_ACP_SESSION_SUPERVISION_POLICY.promptTimeoutMs;

export interface AcpServiceOptions {
  logger?: DiagnosticLogger;
  source?: string;
}

type TaskExecutionRecovery = {
  errorCode: string;
  retryAfterMs: number;
  retryable: boolean;
  taskStatus: 'FAILED' | 'WAITING_RETRY';
};

const retryablePromptProblemTypes = new Set<string>([
  'https://team-ai.dev/problems/acp-prompt-timeout',
  'https://team-ai.dev/problems/acp-provider-initialize-timeout',
  'https://team-ai.dev/problems/acp-provider-exited-during-initialize',
  'https://team-ai.dev/problems/acp-provider-launch-failed',
  'https://team-ai.dev/problems/agent-gateway-unavailable',
]);

function createSessionId() {
  return `acps_${sessionIdGenerator()}`;
}

function createEventId() {
  return `acpe_${eventIdGenerator()}`;
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cloneDefaultSupervisionPolicy(): AcpSupervisionPolicyPayload {
  return {
    ...DEFAULT_ACP_SESSION_SUPERVISION_POLICY,
  };
}

function parseSupervisionPolicy(
  value: string | null | undefined,
): AcpSupervisionPolicyPayload {
  if (!value) {
    return cloneDefaultSupervisionPolicy();
  }

  try {
    const parsed = JSON.parse(value) as Partial<AcpSupervisionPolicyPayload>;
    return resolveSupervisionPolicy(parsed);
  } catch {
    return cloneDefaultSupervisionPolicy();
  }
}

function normalizePositiveInteger(
  value: number | null | undefined,
): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value > 0
    ? value
    : null;
}

function resolveSupervisionPolicy(
  override?: Partial<AcpSupervisionPolicyPayload> | null,
): AcpSupervisionPolicyPayload {
  const base = cloneDefaultSupervisionPolicy();
  const maxSteps =
    override?.maxSteps === null
      ? null
      : normalizePositiveInteger(override?.maxSteps) ?? base.maxSteps;

  return {
    promptTimeoutMs:
      normalizePositiveInteger(override?.promptTimeoutMs) ??
      base.promptTimeoutMs,
    inactivityTimeoutMs:
      normalizePositiveInteger(override?.inactivityTimeoutMs) ??
      base.inactivityTimeoutMs,
    totalTimeoutMs:
      normalizePositiveInteger(override?.totalTimeoutMs) ??
      base.totalTimeoutMs,
    cancelGraceMs:
      normalizePositiveInteger(override?.cancelGraceMs) ?? base.cancelGraceMs,
    completionGraceMs:
      normalizePositiveInteger(override?.completionGraceMs) ??
      base.completionGraceMs,
    providerInitTimeoutMs:
      normalizePositiveInteger(override?.providerInitTimeoutMs) ??
      base.providerInitTimeoutMs,
    packageManagerInitTimeoutMs:
      normalizePositiveInteger(override?.packageManagerInitTimeoutMs) ??
      base.packageManagerInitTimeoutMs,
    maxSteps,
    maxRetries:
      normalizePositiveInteger(override?.maxRetries) ??
      base.maxRetries,
  };
}

function calculateIsoDeadline(
  startedAt: string | null,
  durationMs: number,
): string | null {
  const baseline = startedAt ? Date.parse(startedAt) : Number.NaN;
  const startedAtMs = Number.isNaN(baseline) ? Date.now() : baseline;
  return new Date(startedAtMs + durationMs).toISOString();
}

function calculateActivityDeadline(
  activityAt: string | null,
  durationMs: number,
): string | null {
  const baseline = activityAt ? Date.parse(activityAt) : Number.NaN;
  if (Number.isNaN(baseline)) {
    return null;
  }

  return new Date(baseline + durationMs).toISOString();
}

function throwSessionNotFound(sessionId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/acp-session-not-found',
    title: 'ACP Session Not Found',
    status: 404,
    detail: `ACP session ${sessionId} was not found`,
  });
}

function throwTaskNotFound(taskId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-not-found',
    title: 'Task Not Found',
    status: 404,
    detail: `Task ${taskId} was not found`,
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

function getTaskExecutionRow(
  sqlite: Database,
  taskId: string,
): TaskExecutionRow {
  const row = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          trigger_session_id,
          assigned_role,
          assigned_specialist_id,
          codebase_id,
          completion_summary,
          status,
          kind,
          execution_session_id,
          result_session_id,
          verification_report,
          verification_verdict,
          worktree_id
        FROM project_tasks
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(taskId) as TaskExecutionRow | undefined;

  if (!row) {
    throwTaskNotFound(taskId);
  }

  return row;
}

function updateTaskExecutionState(
  sqlite: Database,
  input: {
    completionSummary?: string | null;
    executionSessionId?: string | null;
    resultSessionId?: string | null;
    status?: string;
    taskId: string;
    verificationReport?: string | null;
    verificationVerdict?: string | null;
  },
) {
  const current = getTaskExecutionRow(sqlite, input.taskId);

  sqlite
    .prepare(
      `
        UPDATE project_tasks
        SET
          execution_session_id = @executionSessionId,
          result_session_id = @resultSessionId,
          completion_summary = @completionSummary,
          verification_report = @verificationReport,
          verification_verdict = @verificationVerdict,
          status = @status,
          updated_at = @updatedAt
        WHERE id = @taskId AND deleted_at IS NULL
      `,
    )
    .run({
      executionSessionId:
        input.executionSessionId === undefined
          ? current.execution_session_id
          : input.executionSessionId,
      resultSessionId:
        input.resultSessionId === undefined
          ? current.result_session_id
          : input.resultSessionId,
      completionSummary:
        input.completionSummary === undefined
          ? current.completion_summary
          : input.completionSummary,
      status: input.status ?? current.status,
      taskId: input.taskId,
      updatedAt: new Date().toISOString(),
      verificationReport:
        input.verificationReport === undefined
          ? current.verification_report
          : input.verificationReport,
      verificationVerdict:
        input.verificationVerdict === undefined
          ? current.verification_verdict
          : input.verificationVerdict,
    });
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
  sqlite
    .prepare(
      `
        UPDATE project_worktrees
        SET
          session_id = @sessionId,
          updated_at = @updatedAt
        WHERE id = @worktreeId
          AND project_id = @projectId
          AND deleted_at IS NULL
      `,
    )
    .run({
      projectId,
      sessionId,
      updatedAt: new Date().toISOString(),
      worktreeId,
    });
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

function resolveFailureMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function classifyTaskExecutionFailure(
  error: unknown,
  phase: 'prompt' | 'session_create',
): TaskExecutionRecovery {
  if (phase === 'session_create') {
    return {
      errorCode:
        error instanceof ProblemError
          ? error.code
          : 'TASK_EXECUTION_SESSION_CREATE_FAILED',
      retryAfterMs: 1000,
      retryable: true,
      taskStatus: 'WAITING_RETRY',
    };
  }

  if (
    error instanceof ProblemError &&
    retryablePromptProblemTypes.has(error.type)
  ) {
    return {
      errorCode: error.code,
      retryAfterMs: 1000,
      retryable: true,
      taskStatus: 'WAITING_RETRY',
    };
  }

  return {
    errorCode: error instanceof ProblemError ? error.code : 'ACP_PROMPT_FAILED',
    retryAfterMs: 0,
    retryable: false,
    taskStatus: 'FAILED',
  };
}

async function recordTaskExecutionCreationFailure(
  sqlite: Database,
  input: {
    completedAt: string;
    message: string;
    projectId: string;
    provider: string;
    retryOfRunId?: string | null;
    role?: string | null;
    sessionId: string;
    source?: string;
    specialistId?: string | null;
    taskId: string;
  },
  options: AcpServiceOptions = {},
) {
  const createdRun = await startTaskRun(
    sqlite,
    {
      projectId: input.projectId,
      provider: input.provider,
      retryOfRunId: input.retryOfRunId,
      role: input.role,
      sessionId: input.sessionId,
      specialistId: input.specialistId,
      status: 'PENDING',
      taskId: input.taskId,
    },
    {
      logger: options.logger,
      reason: 'task_execution_session_create_pending',
      source: input.source ?? options.source ?? 'acp-service',
    },
  );

  await failTaskRun(
    sqlite,
    createdRun.id,
    {
      completedAt: input.completedAt,
      provider: input.provider,
      sessionId: input.sessionId,
      specialistId: input.specialistId,
      summary: input.message,
      verificationReport: input.message,
      verificationVerdict: 'fail',
    },
    {
      logger: options.logger,
      reason: 'task_execution_session_create_failed',
      source: input.source ?? options.source ?? 'acp-service',
    },
  );
}

function extractEventText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseEventRecord(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function getLatestTaskExecutionRun(
  sqlite: Database,
  sessionId: string,
): TaskExecutionRunRow | null {
  return (
    (sqlite
      .prepare(
        `
          SELECT id, status, task_id
          FROM project_task_runs
          WHERE session_id = ?
            AND deleted_at IS NULL
          ORDER BY created_at DESC, updated_at DESC
          LIMIT 1
        `,
      )
      .get(sessionId) as TaskExecutionRunRow | undefined) ?? null
  );
}

function buildTaskExecutionOutcome(
  sqlite: Database,
  sessionId: string,
  state: 'COMPLETED' | 'FAILED' | 'CANCELLED',
  fallbackFailureReason?: string | null,
): {
  summary: string | null;
  verificationReport: string | null;
  verificationVerdict: string | null;
} {
  const rows = sqlite
    .prepare(
      `
        SELECT type, payload_json, error_json
        FROM project_acp_session_events
        WHERE session_id = ?
        ORDER BY sequence ASC
      `,
    )
    .all(sessionId) as SessionHistorySummaryRow[];
  const assistantMessages = new Map<string, string>();
  const assistantOrder: string[] = [];
  const toolOutputs: string[] = [];
  let anonymousAssistantIndex = 0;
  let lastErrorMessage = extractEventText(fallbackFailureReason);
  let cancelReason: string | null = null;

  for (const row of rows) {
    const payload = parseEventRecord(
      row.payload_json,
    ) as unknown as AcpEventUpdatePayload;
    const error = parseEventRecord(row.error_json);

    if (row.type === 'agent_message' && payload.message?.role === 'assistant') {
      const content = extractEventText(payload.message.content);
      if (!content) {
        continue;
      }

      const messageId =
        extractEventText(payload.message.messageId) ??
        `assistant-${anonymousAssistantIndex++}`;
      const previous = assistantMessages.get(messageId) ?? '';

      if (!assistantMessages.has(messageId)) {
        assistantOrder.push(messageId);
      }

      assistantMessages.set(messageId, `${previous}${content}`);
      continue;
    }

    if (
      (row.type === 'tool_call' || row.type === 'tool_call_update') &&
      payload.toolCall?.status === 'completed'
    ) {
      const toolOutput = extractEventText(payload.toolCall.output);
      if (toolOutput) {
        toolOutputs.push(toolOutput);
      }
      continue;
    }

    if (row.type === 'error') {
      lastErrorMessage =
        extractEventText(payload.error?.message) ??
        extractEventText(error.message) ??
        lastErrorMessage;
      continue;
    }

    if (row.type === 'turn_complete') {
      const stopReason = extractEventText(payload.turnComplete?.stopReason);
      cancelReason =
        (stopReason && stopReason !== 'cancelled' ? stopReason : null) ??
        cancelReason;
    }
  }

  const transcript = assistantOrder
    .map((messageId) =>
      extractEventText(assistantMessages.get(messageId) ?? null),
    )
    .filter((message): message is string => message !== null);
  const transcriptReport = transcript.join('\n\n');
  const toolReport = toolOutputs.join('\n\n');
  const latestAssistantMessage = transcript.at(-1) ?? null;

  if (state === 'COMPLETED') {
    const summary = latestAssistantMessage ?? 'ACP session completed';
    const verificationReport = transcriptReport || toolReport || summary;

    return {
      summary,
      verificationReport,
      verificationVerdict: 'pass',
    };
  }

  if (state === 'FAILED') {
    const summary =
      lastErrorMessage ?? latestAssistantMessage ?? 'ACP session failed';
    const verificationReport =
      transcriptReport || toolReport || lastErrorMessage || summary;

    return {
      summary,
      verificationReport,
      verificationVerdict: 'fail',
    };
  }

  const summary = cancelReason ?? lastErrorMessage ?? 'ACP session cancelled';
  const verificationReport =
    transcriptReport ||
    toolReport ||
    cancelReason ||
    lastErrorMessage ||
    summary;

  return {
    summary,
    verificationReport,
    verificationVerdict: 'cancelled',
  };
}

async function syncTaskExecutionOutcome(
  sqlite: Database,
  sessionId: string,
  state: 'COMPLETED' | 'FAILED' | 'CANCELLED',
  fallbackFailureReason?: string | null,
  options: AcpServiceOptions = {},
  taskStatusOverride?: string,
) {
  await flushAcpSessionEventWriteBuffer(sqlite, sessionId);

  const session = getSessionRow(sqlite, sessionId);
  const taskRun = getLatestTaskExecutionRun(sqlite, sessionId);
  if (!taskRun) {
    return;
  }

  const currentTask = getTaskExecutionRow(sqlite, taskRun.task_id);
  const computedOutcome = buildTaskExecutionOutcome(
    sqlite,
    sessionId,
    state,
    fallbackFailureReason ?? session.failure_reason,
  );
  const hasManualReportOutcome =
    currentTask.result_session_id === sessionId &&
    currentTask.execution_session_id === null;
  const outcome = hasManualReportOutcome
    ? {
        summary: currentTask.completion_summary ?? computedOutcome.summary,
        verificationReport:
          currentTask.verification_report ?? computedOutcome.verificationReport,
        verificationVerdict:
          currentTask.verification_verdict ??
          computedOutcome.verificationVerdict,
      }
    : computedOutcome;
  const nextTaskStatus =
    taskStatusOverride ?? (hasManualReportOutcome ? currentTask.status : state);

  updateTaskExecutionState(sqlite, {
    taskId: taskRun.task_id,
    executionSessionId: null,
    resultSessionId: sessionId,
    completionSummary: outcome.summary,
    verificationReport: outcome.verificationReport,
    verificationVerdict: outcome.verificationVerdict,
    status: nextTaskStatus,
  });

  const runInput = {
    completedAt: session.completed_at ?? new Date().toISOString(),
    provider: session.provider,
    sessionId,
    specialistId: session.specialist_id,
    summary: outcome.summary,
    verificationReport: outcome.verificationReport,
    verificationVerdict: outcome.verificationVerdict,
  };

  if (nextTaskStatus === 'COMPLETED') {
    await completeTaskRun(sqlite, taskRun.id, runInput, {
      logger: options.logger,
      reason: 'task_execution_completed',
      source: options.source ?? 'acp-service',
    });
    return;
  }

  if (nextTaskStatus === 'CANCELLED') {
    await cancelTaskRun(sqlite, taskRun.id, runInput, {
      logger: options.logger,
      reason: 'task_execution_cancelled',
      source: options.source ?? 'acp-service',
    });
    return;
  }

  if (nextTaskStatus === 'WAITING_RETRY' || nextTaskStatus === 'FAILED') {
    await failTaskRun(sqlite, taskRun.id, runInput, {
      logger: options.logger,
      reason: 'task_execution_failed',
      source: options.source ?? 'acp-service',
    });
    return;
  }

  await cancelTaskRun(sqlite, taskRun.id, runInput, {
    logger: options.logger,
    reason: 'task_execution_cancelled',
    source: options.source ?? 'acp-service',
  });
}

function mapSessionRow(row: AcpSessionRow): AcpSessionPayload {
  const supervisionPolicy = parseSupervisionPolicy(row.supervision_policy_json);

  return {
    acpError: row.acp_error,
    acpStatus: row.acp_status,
    id: row.id,
    project: { id: row.project_id },
    agent: row.agent_id ? { id: row.agent_id } : null,
    actor: { id: row.actor_id },
    codebase: row.codebase_id ? { id: row.codebase_id } : null,
    parentSession: row.parent_session_id ? { id: row.parent_session_id } : null,
    model: row.model,
    name: row.name,
    provider: row.provider,
    specialistId: row.specialist_id,
    supervisionPolicy,
    deadlineAt: row.deadline_at,
    inactiveDeadlineAt: row.inactive_deadline_at,
    cancelRequestedAt: row.cancel_requested_at,
    cancelledAt: row.cancelled_at,
    forceKilledAt: row.force_killed_at,
    timeoutScope: row.timeout_scope,
    stepCount: row.step_count,
    task: row.task_id ? { id: row.task_id } : null,
    cwd: row.cwd ?? '',
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    completedAt: row.completed_at,
    failureReason: row.failure_reason,
    lastEventId: row.last_event_id ? { id: row.last_event_id } : null,
    worktree: row.worktree_id ? { id: row.worktree_id } : null,
  };
}

function mapEventRow(row: AcpEventRow): AcpEventEnvelopePayload {
  return {
    eventId: row.event_id,
    sessionId: row.session_id,
    emittedAt: row.emitted_at,
    update: JSON.parse(row.payload_json) as AcpEventUpdatePayload,
    error: row.error_json
      ? (JSON.parse(row.error_json) as AcpEventErrorPayload)
      : null,
  };
}

function getSessionRow(sqlite: Database, sessionId: string): AcpSessionRow {
  const row = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          agent_id,
          actor_id,
          supervision_policy_json,
          deadline_at,
          inactive_deadline_at,
          cancel_requested_at,
          cancelled_at,
          force_killed_at,
          timeout_scope,
          step_count,
          codebase_id,
          parent_session_id,
          name,
          model,
          provider,
          cwd,
          acp_status,
          acp_error,
          state,
          runtime_session_id,
          specialist_id,
          failure_reason,
          last_event_id,
          started_at,
          last_activity_at,
          completed_at,
          task_id,
          worktree_id
        FROM project_acp_sessions
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(sessionId) as AcpSessionRow | undefined;

  if (!row) {
    throwSessionNotFound(sessionId);
  }

  return row;
}

function updateSessionRuntime(
  sqlite: Database,
  sessionId: string,
  update: {
    completedAt?: string | null;
    acpError?: string | null;
    acpStatus?: AcpSessionStatus;
    cancelRequestedAt?: string | null;
    cancelledAt?: string | null;
    deadlineAt?: string | null;
    failureReason?: string | null;
    forceKilledAt?: string | null;
    inactiveDeadlineAt?: string | null;
    lastActivityAt?: string | null;
    lastEventId?: string | null;
    name?: string | null;
    runtimeSessionId?: string | null;
    startedAt?: string | null;
    state?: AcpSessionState;
    stepCount?: number;
    supervisionPolicy?: AcpSupervisionPolicyPayload;
    timeoutScope?: AcpTimeoutScopePayload | null;
  },
) {
  const current = getSessionRow(sqlite, sessionId);
  const nextPolicy = resolveSupervisionPolicy(
    update.supervisionPolicy === undefined
      ? parseSupervisionPolicy(current.supervision_policy_json)
      : update.supervisionPolicy,
  );
  const nextState = update.state ?? current.state;
  const nextInactiveDeadlineAt =
    update.inactiveDeadlineAt === undefined
      ? update.lastActivityAt !== undefined && nextState === 'RUNNING'
        ? calculateActivityDeadline(
            update.lastActivityAt,
            nextPolicy.inactivityTimeoutMs,
          ) ?? current.inactive_deadline_at
        : current.inactive_deadline_at
      : update.inactiveDeadlineAt;
  sqlite
    .prepare(
      `
        UPDATE project_acp_sessions
        SET
          name = @name,
          supervision_policy_json = @supervisionPolicyJson,
          deadline_at = @deadlineAt,
          inactive_deadline_at = @inactiveDeadlineAt,
          cancel_requested_at = @cancelRequestedAt,
          cancelled_at = @cancelledAt,
          force_killed_at = @forceKilledAt,
          timeout_scope = @timeoutScope,
          step_count = @stepCount,
          runtime_session_id = @runtimeSessionId,
          acp_status = @acpStatus,
          acp_error = @acpError,
          state = @state,
          failure_reason = @failureReason,
          last_event_id = @lastEventId,
          started_at = @startedAt,
          last_activity_at = @lastActivityAt,
          completed_at = @completedAt,
          updated_at = @updatedAt
        WHERE id = @id
      `,
    )
    .run({
      id: sessionId,
      name: update.name === undefined ? current.name : update.name,
      supervisionPolicyJson: JSON.stringify(nextPolicy),
      deadlineAt:
        update.deadlineAt === undefined ? current.deadline_at : update.deadlineAt,
      inactiveDeadlineAt: nextInactiveDeadlineAt,
      cancelRequestedAt:
        update.cancelRequestedAt === undefined
          ? current.cancel_requested_at
          : update.cancelRequestedAt,
      cancelledAt:
        update.cancelledAt === undefined
          ? current.cancelled_at
          : update.cancelledAt,
      forceKilledAt:
        update.forceKilledAt === undefined
          ? current.force_killed_at
          : update.forceKilledAt,
      timeoutScope:
        update.timeoutScope === undefined
          ? current.timeout_scope
          : update.timeoutScope,
      stepCount:
        update.stepCount === undefined ? current.step_count : update.stepCount,
      runtimeSessionId: update.runtimeSessionId ?? current.runtime_session_id,
      acpStatus:
        update.acpStatus === undefined ? current.acp_status : update.acpStatus,
      acpError:
        update.acpError === undefined ? current.acp_error : update.acpError,
      state: nextState,
      failureReason:
        update.failureReason === undefined
          ? current.failure_reason
          : update.failureReason,
      lastEventId:
        update.lastEventId === undefined
          ? current.last_event_id
          : update.lastEventId,
      startedAt:
        update.startedAt === undefined ? current.started_at : update.startedAt,
      lastActivityAt:
        update.lastActivityAt === undefined
          ? current.last_activity_at
          : update.lastActivityAt,
      completedAt:
        update.completedAt === undefined
          ? current.completed_at
          : update.completedAt,
      updatedAt: new Date().toISOString(),
    });
}

function createCanonicalUpdate(
  sessionId: string,
  provider: string,
  eventType: AcpEventUpdatePayload['eventType'],
  extras: Omit<
    Partial<AcpEventUpdatePayload>,
    'eventType' | 'provider' | 'rawNotification' | 'sessionId' | 'timestamp'
  > = {},
): AcpEventUpdatePayload {
  return {
    sessionId,
    provider,
    eventType,
    timestamp: new Date().toISOString(),
    rawNotification: null,
    ...extras,
  };
}

function appendLocalEvent(
  sqlite: Database,
  broker: AcpStreamBroker,
  input: {
    error?: AcpEventErrorPayload | null;
    eventId?: string;
    sessionId: string;
    update: AcpEventUpdatePayload;
  },
): AcpEventEnvelopePayload {
  const emittedAt = input.update.timestamp || new Date().toISOString();
  const current = getSessionRow(sqlite, input.sessionId);
  const update: AcpEventUpdatePayload = {
    ...input.update,
    // Runtime providers can emit their own remote session ids. Persist and
    // broadcast events against the local ACP session id used by our database.
    sessionId: input.sessionId,
    timestamp: emittedAt,
  };
  const event: AcpEventEnvelopePayload = {
    eventId: input.eventId ?? createEventId(),
    sessionId: update.sessionId,
    emittedAt,
    update,
    error: input.error ?? null,
  };

  getAcpSessionEventWriteBuffer(sqlite).add(event);

  updateSessionRuntime(sqlite, input.sessionId, {
    lastActivityAt: emittedAt,
    lastEventId: event.eventId,
    stepCount:
      current.state === 'RUNNING'
        ? current.step_count + resolveStepCountIncrement(update)
        : current.step_count,
  });

  recordAcpTrace(sqlite, {
    createdAt: emittedAt,
    eventId: event.eventId,
    sessionId: input.sessionId,
    update,
  });

  broker.publish(event);
  return event;
}

export function hasAcpSessionEvent(sqlite: Database, eventId: string) {
  if (getAcpSessionEventWriteBuffer(sqlite).hasEvent(eventId)) {
    return true;
  }

  const row = sqlite
    .prepare(
      `
        SELECT 1 AS present
        FROM project_acp_session_events
        WHERE event_id = ?
        LIMIT 1
      `,
    )
    .get(eventId) as { present: number } | undefined;

  return row?.present === 1;
}

export function recordAcpOrchestrationEvent(
  sqlite: Database,
  broker: AcpStreamBroker,
  input: {
    childSessionId?: string | null;
    delegationGroupId?: string | null;
    eventId?: string;
    eventName: AcpOrchestrationEventName;
    parentSessionId?: string | null;
    sessionId: string;
    taskId?: string | null;
    taskIds?: string[];
    wakeDelivered?: boolean;
  },
) {
  const session = getSessionRow(sqlite, input.sessionId);

  return appendLocalEvent(sqlite, broker, {
    eventId: input.eventId,
    sessionId: input.sessionId,
    update: createCanonicalUpdate(
      input.sessionId,
      session.provider,
      'orchestration_update',
      {
        orchestration: {
          childSessionId: input.childSessionId ?? null,
          delegationGroupId: input.delegationGroupId ?? null,
          eventName: input.eventName,
          parentSessionId: input.parentSessionId ?? null,
          taskId: input.taskId ?? null,
          taskIds: input.taskIds ?? [],
          wakeDelivered: input.wakeDelivered,
        },
      },
    ),
  });
}

function getSessionAgentPrompt(
  sqlite: Database,
  session: Pick<AcpSessionRow, 'agent_id' | 'project_id'>,
): string | null {
  if (!session.agent_id) {
    return null;
  }

  const row = sqlite
    .prepare(
      `
        SELECT system_prompt
        FROM project_agents
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `,
    )
    .get(session.agent_id, session.project_id) as
    | { system_prompt: string | null }
    | undefined;

  return row?.system_prompt?.trim() || null;
}

function sessionHasPromptHistory(sqlite: Database, sessionId: string): boolean {
  const row = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM project_acp_session_events
        WHERE session_id = ?
          AND type IN ('user_message', 'agent_message', 'agent_thought')
      `,
    )
    .get(sessionId) as { count: number };

  return row.count > 0;
}

function createRuntimeHooks(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  localSessionId: string,
  options: AcpServiceOptions = {},
): AcpRuntimeSessionHooks {
  return {
    async onSessionUpdate(update) {
      const current = getSessionRow(sqlite, localSessionId);
      const normalized: NormalizedSessionUpdate = update;
      const emitted = appendLocalEvent(sqlite, broker, {
        sessionId: localSessionId,
        update: normalized,
      });

      const state = resolveSessionStateFromNormalizedUpdate(
        normalized,
        current.state,
      );
      const metadata = extractSessionMetadataFromNormalizedUpdate(normalized);
      updateSessionRuntime(sqlite, localSessionId, {
        acpError:
          state === 'FAILED'
            ? (emitted.error?.message ?? current.acp_error)
            : null,
        acpStatus: state === 'FAILED' ? 'error' : 'ready',
        state,
        lastActivityAt: metadata.updatedAt ?? emitted.emittedAt,
        name: metadata.title ?? current.name,
        completedAt:
          state === 'CANCELLED' || state === 'FAILED'
            ? emitted.emittedAt
            : null,
        failureReason: state === 'FAILED' ? current.failure_reason : null,
      });
      await enforceStepBudgetIfNeeded(
        sqlite,
        broker,
        runtime,
        localSessionId,
        options,
      );
    },
    async onClosed(error) {
      const current = getSessionRow(sqlite, localSessionId);
      if (!error) {
        return;
      }

      if (current.state === 'CANCELLED' || current.state === 'FAILED') {
        return;
      }

      appendLocalEvent(sqlite, broker, {
        sessionId: localSessionId,
        update: createCanonicalUpdate(
          localSessionId,
          current.provider,
          'error',
          {
            error: {
              code: 'ACP_CONNECTION_CLOSED',
              message: error.message,
            },
          },
        ),
        error: {
          code: 'ACP_CONNECTION_CLOSED',
          message: error.message,
          retryable: true,
          retryAfterMs: 1000,
        },
      });

      updateSessionRuntime(sqlite, localSessionId, {
        acpStatus: 'error',
        acpError: error.message,
        state: 'FAILED',
        failureReason: error.message,
        completedAt: new Date().toISOString(),
      });
      appendLifecycleEvent(sqlite, broker, {
        detail: error.message,
        sessionId: localSessionId,
        state: 'failed',
        taskBound: current.task_id !== null,
      });

      await syncTaskExecutionOutcome(
        sqlite,
        localSessionId,
        'FAILED',
        error.message,
        options,
      );
    },
  };
}

function appendPromptRequestedEvents(
  sqlite: Database,
  broker: AcpStreamBroker,
  sessionId: string,
  provider: string,
  prompt: string,
  eventId?: string,
) {
  appendLocalEvent(sqlite, broker, {
    sessionId,
    eventId,
    update: createCanonicalUpdate(sessionId, provider, 'user_message', {
      message: {
        role: 'user',
        messageId: null,
        content: prompt,
        contentBlock: {
          type: 'text',
          text: prompt,
        },
        isChunk: false,
      },
    }),
  });
}

async function enforceStepBudgetIfNeeded(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  sessionId: string,
  options: AcpServiceOptions = {},
) {
  const session = getSessionRow(sqlite, sessionId);
  const supervisionPolicy = parseSupervisionPolicy(session.supervision_policy_json);
  if (
    session.state !== 'RUNNING' ||
    supervisionPolicy.maxSteps === null ||
    session.step_count <= supervisionPolicy.maxSteps
  ) {
    return;
  }

  const nowIso = new Date().toISOString();
  const detail =
    `ACP session exceeded step budget ` +
    `(${session.step_count}/${supervisionPolicy.maxSteps}).`;
  await requestSessionSupervisionCancellation(
    sqlite,
    broker,
    runtime,
    session,
    {
      detail,
      nowIso,
      policy: supervisionPolicy,
      scope: 'step_budget',
    },
    options,
  );
}

function appendLifecycleEvent(
  sqlite: Database,
  broker: AcpStreamBroker,
  input: {
    detail?: string | null;
    sessionId: string;
    state: AcpLifecycleStatePayload;
    taskBound: boolean;
  },
) {
  const session = getSessionRow(sqlite, input.sessionId);
  return appendLocalEvent(sqlite, broker, {
    sessionId: input.sessionId,
    update: createCanonicalUpdate(
      input.sessionId,
      session.provider,
      'lifecycle_update',
      {
        lifecycle: {
          detail: input.detail ?? null,
          state: input.state,
          taskBound: input.taskBound,
        },
      },
    ),
  });
}

function appendSupervisionEvent(
  sqlite: Database,
  broker: AcpStreamBroker,
  input: {
    detail?: string | null;
    forceKilled?: boolean;
    policy?: AcpSupervisionPolicyPayload;
    scope?: AcpTimeoutScopePayload;
    sessionId: string;
    stage:
      | 'policy_resolved'
      | 'timeout_detected'
      | 'cancel_requested'
      | 'cancel_grace_expired'
      | 'force_killed';
  },
) {
  const session = getSessionRow(sqlite, input.sessionId);
  return appendLocalEvent(sqlite, broker, {
    sessionId: input.sessionId,
    update: createCanonicalUpdate(
      input.sessionId,
      session.provider,
      'supervision_update',
      {
        supervision: {
          detail: input.detail ?? null,
          forceKilled: input.forceKilled ?? false,
          policy: input.policy,
          scope: input.scope,
          stage: input.stage,
        },
      },
    ),
  });
}

function resolveStepCountIncrement(
  update: AcpEventUpdatePayload,
): number {
  if (update.eventType === 'turn_complete') {
    return 1;
  }

  if (
    (update.eventType === 'tool_call' ||
      update.eventType === 'tool_call_update') &&
    (update.toolCall?.status === 'completed' ||
      update.toolCall?.status === 'failed')
  ) {
    return 1;
  }

  return 0;
}

function resolveLifecycleFailureState(error: unknown): Extract<
  AcpLifecycleStatePayload,
  'failed' | 'timed_out_prompt' | 'timed_out_provider_initialize'
> {
  if (
    error instanceof ProblemError &&
    error.type === 'https://team-ai.dev/problems/acp-prompt-timeout'
  ) {
    return 'timed_out_prompt';
  }

  if (
    error instanceof ProblemError &&
    error.type === 'https://team-ai.dev/problems/acp-provider-initialize-timeout'
  ) {
    return 'timed_out_provider_initialize';
  }

  return 'failed';
}

function resolveTimeoutLifecycleState(
  scope: AcpTimeoutScopePayload,
): Extract<
  AcpLifecycleStatePayload,
  | 'timed_out_prompt'
  | 'timed_out_inactive'
  | 'timed_out_total'
  | 'timed_out_step_budget'
  | 'timed_out_provider_initialize'
> {
  switch (scope) {
    case 'session_total':
      return 'timed_out_total';
    case 'session_inactive':
      return 'timed_out_inactive';
    case 'step_budget':
      return 'timed_out_step_budget';
    case 'provider_initialize':
      return 'timed_out_provider_initialize';
    default:
      return 'timed_out_prompt';
  }
}

async function requestSessionSupervisionCancellation(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  session: AcpSessionRow,
  input: {
    detail: string;
    nowIso: string;
    policy: AcpSupervisionPolicyPayload;
    scope: AcpTimeoutScopePayload;
  },
  options: AcpServiceOptions = {},
) {
  appendSupervisionEvent(sqlite, broker, {
    sessionId: session.id,
    stage: 'timeout_detected',
    scope: input.scope,
    policy: input.policy,
    detail: input.detail,
  });
  updateSessionRuntime(sqlite, session.id, {
    acpError: null,
    acpStatus: 'ready',
    state: 'CANCELLING',
    failureReason: input.detail,
    cancelRequestedAt: input.nowIso,
    timeoutScope: input.scope,
    supervisionPolicy: input.policy,
  });
  appendSupervisionEvent(sqlite, broker, {
    sessionId: session.id,
    stage: 'cancel_requested',
    scope: input.scope,
    policy: input.policy,
    detail: `Requested ACP session cancellation after ${input.scope} timeout.`,
  });
  appendLifecycleEvent(sqlite, broker, {
    detail: input.detail,
    sessionId: session.id,
    state: 'cancelling',
    taskBound: session.task_id !== null,
  });

  if (session.runtime_session_id && !runtime.isSessionActive(session.id)) {
    await ensureRuntimeLoaded(sqlite, broker, runtime, session.id, options);
  }

  if (session.runtime_session_id !== null || runtime.isSessionActive(session.id)) {
    await runtime.cancelSession({
      localSessionId: session.id,
      reason: input.detail,
    });
  }
}

const REPLAY_HISTORY_CHAR_LIMIT = 24_000;

function trimReplayTranscriptSegments(
  segments: string[],
  maxChars: number,
): string {
  if (segments.length === 0) {
    return '';
  }

  const kept: string[] = [];
  let total = 0;

  for (const segment of [...segments].reverse()) {
    const additional = segment.length + (kept.length > 0 ? 2 : 0);
    if (kept.length > 0 && total + additional > maxChars) {
      break;
    }

    if (kept.length === 0 && segment.length > maxChars) {
      kept.unshift(segment.slice(segment.length - maxChars));
      total = maxChars;
      break;
    }

    kept.unshift(segment);
    total += additional;
  }

  const omitted = segments.length - kept.length;
  return omitted > 0
    ? [
        `System note:\n${omitted} earlier transcript entries were omitted to fit the replay window.`,
        ...kept,
      ].join('\n\n')
    : kept.join('\n\n');
}

function buildAcpSessionReplayPrompt(
  sqlite: Database,
  sessionId: string,
  nextConfig: {
    model: string | null;
    provider: string;
  },
): string | null {
  const session = getSessionRow(sqlite, sessionId);
  const systemPrompt = getSessionAgentPrompt(sqlite, session);
  const rows = sqlite
    .prepare(
      `
        SELECT type, payload_json, error_json
        FROM project_acp_session_events
        WHERE session_id = ?
        ORDER BY sequence ASC
      `,
    )
    .all(sessionId) as SessionHistorySummaryRow[];

  const segments: string[] = [];
  let pendingAssistant: {
    content: string;
    messageId: string | null;
  } | null = null;

  const flushAssistant = () => {
    if (!pendingAssistant) {
      return;
    }

    const content = pendingAssistant.content.trim();
    if (content) {
      segments.push(`Assistant:\n${content}`);
    }
    pendingAssistant = null;
  };

  for (const row of rows) {
    const payload = parseEventRecord(
      row.payload_json,
    ) as unknown as AcpEventUpdatePayload;
    const error = parseEventRecord(row.error_json);

    if (row.type === 'user_message' && payload.message?.role === 'user') {
      flushAssistant();
      const content = extractEventText(payload.message.content);
      if (content) {
        segments.push(`User:\n${content}`);
      }
      continue;
    }

    if (row.type === 'agent_message' && payload.message?.role === 'assistant') {
      const content = extractEventText(payload.message.content);
      if (!content) {
        continue;
      }

      const messageId = extractEventText(payload.message.messageId);
      if (pendingAssistant && pendingAssistant.messageId === messageId) {
        pendingAssistant.content += content;
      } else {
        flushAssistant();
        pendingAssistant = {
          content,
          messageId,
        };
      }
      continue;
    }

    flushAssistant();

    if (
      (row.type === 'tool_call' || row.type === 'tool_call_update') &&
      payload.toolCall?.status === 'completed'
    ) {
      const output = extractEventText(payload.toolCall.output);
      if (output) {
        segments.push(`Tool result:\n${output}`);
      }
      continue;
    }

    if (row.type === 'error') {
      const message =
        extractEventText(payload.error?.message) ??
        extractEventText(error.message);
      if (message) {
        segments.push(`System note:\nPrevious runtime error: ${message}`);
      }
    }
  }

  flushAssistant();

  const transcript = trimReplayTranscriptSegments(
    segments,
    REPLAY_HISTORY_CHAR_LIMIT,
  );
  if (!transcript) {
    return null;
  }

  const metadata = [
    `- provider: ${nextConfig.provider}`,
    `- model: ${nextConfig.model ?? 'provider default'}`,
    `- cwd: ${session.cwd ?? ''}`,
    ...(session.task_id ? [`- taskId: ${session.task_id}`] : []),
  ].join('\n');

  return [
    ...(systemPrompt ? [`System:\n${systemPrompt.trim()}`] : []),
    'Replay context:\nYou are resuming an existing ACP conversation after the runtime was restarted because the provider or model changed.',
    `Session metadata:\n${metadata}`,
    `Conversation history:\n${transcript}`,
    'Instruction:\nTreat the conversation history above as authoritative prior context. Do not call tools, do not continue the task yet, and reply with exactly: ACK',
  ].join('\n\n');
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
    await enforceStepBudgetIfNeeded(sqlite, broker, runtime, sessionId, options);
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

async function ensureRuntimeLoaded(
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
    hooks: createRuntimeHooks(sqlite, broker, runtime, session.id, options),
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
      codebaseId: input.codebaseId,
      cwd: input.cwd,
      task,
      worktreeId: input.worktreeId,
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

  sqlite
    .prepare(
      `
        INSERT INTO project_acp_sessions (
          id,
          project_id,
          agent_id,
          actor_id,
          codebase_id,
          parent_session_id,
          specialist_id,
          name,
          model,
          provider,
          cwd,
          worktree_id,
          task_id,
          acp_status,
          acp_error,
          supervision_policy_json,
          deadline_at,
          inactive_deadline_at,
          cancel_requested_at,
          cancelled_at,
          force_killed_at,
          timeout_scope,
          step_count,
          state,
          runtime_session_id,
          failure_reason,
          last_event_id,
          started_at,
          last_activity_at,
          completed_at,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          @id,
          @projectId,
          @agentId,
          @actorId,
          @codebaseId,
          @parentSessionId,
          @specialistId,
          @name,
          @model,
          @provider,
          @cwd,
          @worktreeId,
          @taskId,
          @acpStatus,
          @acpError,
          @supervisionPolicyJson,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          0,
          @state,
          NULL,
          NULL,
          NULL,
          @startedAt,
          @lastActivityAt,
          NULL,
          @createdAt,
          @updatedAt,
          NULL
        )
      `,
    )
    .run({
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
      state: 'PENDING',
      startedAt: now,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });

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
      hooks: createRuntimeHooks(sqlite, broker, runtime, sessionId, options),
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
        status: 'RUNNING',
      });
    }
  } catch (error) {
    const message = resolveFailureMessage(error, 'ACP session creation failed');
    const recovery = classifyTaskExecutionFailure(error, 'session_create');
    const diagnostics = getErrorDiagnostics(error, 'ACP_SESSION_CREATE_FAILED');

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

  return await getAcpSessionById(sqlite, sessionId);
}

export async function listAcpSessionsByProject(
  sqlite: Database,
  projectId: string,
  query: ListSessionsQuery,
): Promise<AcpSessionListPayload> {
  await getProjectById(sqlite, projectId);
  const { page, pageSize } = query;
  const offset = (page - 1) * pageSize;

  const rows = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          agent_id,
          actor_id,
          supervision_policy_json,
          deadline_at,
          inactive_deadline_at,
          cancel_requested_at,
          cancelled_at,
          force_killed_at,
          timeout_scope,
          step_count,
          codebase_id,
          parent_session_id,
          specialist_id,
          name,
          model,
          provider,
          cwd,
          acp_status,
          acp_error,
          state,
          runtime_session_id,
          failure_reason,
          last_event_id,
          started_at,
          last_activity_at,
          completed_at,
          task_id,
          worktree_id
        FROM project_acp_sessions
        WHERE project_id = @projectId AND deleted_at IS NULL
        ORDER BY COALESCE(last_activity_at, started_at, completed_at) DESC, updated_at DESC
        LIMIT @limit OFFSET @offset
      `,
    )
    .all({
      projectId,
      limit: pageSize,
      offset,
    }) as AcpSessionRow[];

  const total = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM project_acp_sessions
        WHERE project_id = @projectId AND deleted_at IS NULL
      `,
    )
    .get({ projectId }) as { count: number };

  return {
    items: rows.map(mapSessionRow),
    page,
    pageSize,
    projectId,
    total: total.count,
  };
}

export async function getAcpSessionById(
  sqlite: Database,
  sessionId: string,
): Promise<AcpSessionPayload> {
  return mapSessionRow(getSessionRow(sqlite, sessionId));
}

export async function listAcpSessionHistory(
  sqlite: Database,
  projectId: string,
  sessionId: string,
  limit: number,
  sinceEventId?: string,
): Promise<AcpEventEnvelopePayload[]> {
  const session = getSessionRow(sqlite, sessionId);
  if (session.project_id !== projectId) {
    throwSessionNotFound(sessionId);
  }

  await flushAcpSessionEventWriteBuffer(sqlite, sessionId);

  const sinceSequence = sinceEventId
    ? ((
        sqlite
          .prepare(
            `
            SELECT sequence
            FROM project_acp_session_events
            WHERE event_id = ? AND session_id = ?
          `,
          )
          .get(sinceEventId, sessionId) as { sequence: number } | undefined
      )?.sequence ?? 0)
    : 0;

  const rows = sqlite
    .prepare(
      `
        SELECT
          event_id,
          session_id,
          type,
          payload_json,
          error_json,
          emitted_at
        FROM project_acp_session_events
        WHERE session_id = @sessionId AND sequence > @sinceSequence
        ORDER BY sequence ASC
        LIMIT @limit
      `,
    )
    .all({
      sessionId,
      sinceSequence,
      limit,
    }) as AcpEventRow[];

  return rows.map(mapEventRow);
}

export async function listAcpRuntimeSessions(
  sqlite: Database,
  runtime: AcpRuntimeClient,
  streamSubscribers: (sessionId: string) => number,
): Promise<AcpRuntimeSessionListPayload> {
  const runtimeSessions = runtime.listSessions?.() ?? [];
  const items = runtimeSessions
    .map((runtimeSession) =>
      mapRuntimeSessionSnapshot(sqlite, runtimeSession, streamSubscribers),
    )
    .sort(
      (left, right) =>
        Date.parse(right.lastTouchedAt) - Date.parse(left.lastTouchedAt),
    );

  return {
    items,
    total: items.length,
  };
}

function listSupervisedSessions(sqlite: Database): AcpSessionRow[] {
  return sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          agent_id,
          actor_id,
          supervision_policy_json,
          deadline_at,
          inactive_deadline_at,
          cancel_requested_at,
          cancelled_at,
          force_killed_at,
          timeout_scope,
          step_count,
          codebase_id,
          parent_session_id,
          specialist_id,
          name,
          model,
          provider,
          cwd,
          acp_status,
          acp_error,
          state,
          runtime_session_id,
          failure_reason,
          last_event_id,
          started_at,
          last_activity_at,
          completed_at,
          task_id,
          worktree_id
        FROM project_acp_sessions
        WHERE deleted_at IS NULL
          AND state IN ('RUNNING', 'CANCELLING')
        ORDER BY updated_at ASC
      `,
    )
    .all() as AcpSessionRow[];
}

function resolveSupervisionTimeoutDetail(scope: AcpTimeoutScopePayload): string {
  switch (scope) {
    case 'session_total':
      return 'ACP session exceeded its total runtime budget.';
    case 'session_inactive':
      return 'ACP session exceeded its inactivity budget.';
    default:
      return `ACP session timed out (${scope}).`;
  }
}

export async function runAcpSessionSupervisionTick(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  options: AcpServiceOptions & {
    now?: Date;
  } = {},
): Promise<{
  checkedSessionIds: string[];
  forcedSessionIds: string[];
  timedOutSessionIds: string[];
}> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const checkedSessionIds: string[] = [];
  const forcedSessionIds: string[] = [];
  const timedOutSessionIds: string[] = [];
  const sessions = listSupervisedSessions(sqlite);

  for (const session of sessions) {
    checkedSessionIds.push(session.id);

    try {
      const supervisionPolicy = parseSupervisionPolicy(
        session.supervision_policy_json,
      );

      if (session.state === 'RUNNING') {
        const scope =
          session.deadline_at !== null &&
          Date.parse(session.deadline_at) <= nowMs
            ? 'session_total'
            : session.inactive_deadline_at !== null &&
                Date.parse(session.inactive_deadline_at) <= nowMs
              ? 'session_inactive'
              : null;

        if (!scope) {
          continue;
        }

        const detail = resolveSupervisionTimeoutDetail(scope);
        timedOutSessionIds.push(session.id);
        await requestSessionSupervisionCancellation(
          sqlite,
          broker,
          runtime,
          session,
          {
            detail,
            nowIso,
            policy: supervisionPolicy,
            scope,
          },
          options,
        );

        continue;
      }

      if (session.state !== 'CANCELLING' || !session.cancel_requested_at) {
        continue;
      }

      const cancelRequestedAtMs = Date.parse(session.cancel_requested_at);
      if (
        Number.isNaN(cancelRequestedAtMs) ||
        nowMs - cancelRequestedAtMs < supervisionPolicy.cancelGraceMs
      ) {
        continue;
      }

      const timeoutScope = session.timeout_scope ?? 'force_kill_grace';
      const detail =
        timeoutScope === 'force_kill_grace'
          ? 'ACP session exceeded cancel grace and was force-killed.'
          : `ACP session timed out (${timeoutScope}) and exceeded cancel grace; force-killing runtime.`;

      forcedSessionIds.push(session.id);
      appendSupervisionEvent(sqlite, broker, {
        sessionId: session.id,
        stage: 'cancel_grace_expired',
        scope: timeoutScope,
        policy: supervisionPolicy,
        detail,
      });
      await runtime.killSession(session.id);
      appendSupervisionEvent(sqlite, broker, {
        sessionId: session.id,
        stage: 'force_killed',
        scope: timeoutScope,
        policy: supervisionPolicy,
        detail,
        forceKilled: true,
      });
      updateSessionRuntime(sqlite, session.id, {
        acpError: detail,
        acpStatus: 'error',
        state: 'FAILED',
        failureReason: detail,
        completedAt: nowIso,
        cancelledAt: nowIso,
        forceKilledAt: nowIso,
        lastActivityAt: nowIso,
        timeoutScope,
        supervisionPolicy,
      });
      appendLifecycleEvent(sqlite, broker, {
        detail,
        sessionId: session.id,
        state: 'force_killed',
        taskBound: session.task_id !== null,
      });

      await syncTaskExecutionOutcome(
        sqlite,
        session.id,
        'FAILED',
        detail,
        options,
      );
    } catch (error) {
      options.logger?.error?.(
        {
          error:
            error instanceof Error
              ? {
                  message: error.message,
                  stack: error.stack,
                }
              : String(error),
          sessionId: session.id,
        },
        'ACP session supervision tick failed for session',
      );
    }
  }

  return {
    checkedSessionIds,
    forcedSessionIds,
    timedOutSessionIds,
  };
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
  sqlite
    .prepare(
      `
        UPDATE project_acp_sessions
        SET name = ?, updated_at = ?
        WHERE id = ?
      `,
    )
    .run(trimmedName, new Date().toISOString(), sessionId);

  return await getAcpSessionById(sqlite, sessionId);
}

function mapRuntimeSessionSnapshot(
  sqlite: Database,
  runtimeSession: ManagedAcpSessionSnapshot,
  streamSubscribers: (sessionId: string) => number,
): AcpRuntimeSessionPayload {
  let session: AcpSessionPayload | null = null;

  try {
    session = mapSessionRow(getSessionRow(sqlite, runtimeSession.localSessionId));
  } catch {
    session = null;
  }

  return {
    cwd: runtimeSession.cwd,
    isBusy: runtimeSession.isBusy,
    lastTouchedAt: runtimeSession.lastTouchedAt,
    localSessionId: runtimeSession.localSessionId,
    provider: runtimeSession.provider,
    runtimeSessionId: runtimeSession.runtimeSessionId,
    session,
    streamSubscriberCount: streamSubscribers(runtimeSession.localSessionId),
  };
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
    return await getAcpSessionById(sqlite, sessionId);
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
  sqlite
    .prepare(
      `
        UPDATE project_acp_sessions
        SET name = @name,
            model = @model,
            provider = @provider,
            runtime_session_id = @runtimeSessionId,
            acp_status = @acpStatus,
            acp_error = @acpError,
            state = @state,
            failure_reason = @failureReason,
            completed_at = @completedAt,
            last_activity_at = @lastActivityAt,
            updated_at = @updatedAt
        WHERE id = @id
      `,
    )
    .run({
      id: sessionId,
      model: nextModel,
      name: nextName,
      provider: nextProvider,
      runtimeSessionId:
        runtimeSession?.runtimeSessionId ?? current.runtime_session_id,
      acpStatus: runtimeConfigChanged ? 'ready' : current.acp_status,
      acpError: runtimeConfigChanged ? null : current.acp_error,
      state: runtimeConfigChanged ? 'PENDING' : current.state,
      failureReason: runtimeConfigChanged ? null : current.failure_reason,
      completedAt: runtimeConfigChanged ? null : current.completed_at,
      lastActivityAt: runtimeConfigChanged ? now : current.last_activity_at,
      updatedAt: now,
    });

  if (current.agent_id && (providerChanged || modelChanged)) {
    await updateAgent(sqlite, projectId, current.agent_id, {
      provider: nextProvider,
      model: nextModel ?? 'default',
    });
  }

  return await getAcpSessionById(sqlite, sessionId);
}

export async function deleteAcpSession(
  sqlite: Database,
  runtime: AcpRuntimeClient,
  sessionId: string,
): Promise<void> {
  getSessionRow(sqlite, sessionId);
  await runtime.killSession(sessionId);
  sqlite
    .prepare(
      `
        UPDATE project_acp_sessions
        SET deleted_at = ?, updated_at = ?
        WHERE id = ?
      `,
    )
    .run(new Date().toISOString(), new Date().toISOString(), sessionId);
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
      hooks: createRuntimeHooks(sqlite, broker, runtime, session.id, options),
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
      sessionId,
      runtimeResult.response,
      options,
    );

    return {
      session: await getAcpSessionById(sqlite, sessionId),
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
    reason,
    options,
  );

  return await getAcpSessionById(sqlite, sessionId);
}
