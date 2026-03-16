import type { Database } from 'better-sqlite3';
import { isAbsolute } from 'node:path';
import { customAlphabet } from 'nanoid';
import type { McpServer, PromptResponse } from '@agentclientprotocol/sdk';
import type {
  AcpRuntimeClient,
  AcpRuntimeSessionHooks,
} from '../clients/acp-runtime-client';
import {
  getErrorDiagnostics,
  logDiagnostic,
  type DiagnosticLogger,
} from '../diagnostics';
import { ProblemError } from '../errors/problem-error';
import type { AcpStreamBroker } from '../plugins/acp-stream';
import type {
  AcpEventEnvelopePayload,
  AcpEventErrorPayload,
  AcpEventUpdatePayload,
  AcpSessionListPayload,
  AcpSessionPayload,
  AcpSessionStatus,
  AcpSessionState,
} from '../schemas/acp';
import { normalizeAcpProviderId } from './acp-provider-service';
import { type NormalizedSessionUpdate } from './normalized-session-update';
import { createAgent } from './agent-service';
import { getProjectCodebaseById } from './project-codebase-service';
import { getProjectRuntimeProfile } from './project-runtime-profile-service';
import { getProjectById } from './project-service';
import { getProjectWorktreeById } from './project-worktree-service';
import {
  ensureRoleValue,
  getDefaultSpecialistByRole,
  getSpecialistById,
  throwSpecialistRoleMismatch,
} from './specialist-service';
import {
  cancelTaskRun,
  completeTaskRun,
  failTaskRun,
  startTaskRun,
} from './task-run-service';

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
  codebase_id: string | null;
  completed_at: string | null;
  cwd: string | null;
  failure_reason: string | null;
  id: string;
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
  state: AcpSessionState;
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
  goal?: string;
  model?: string | null;
  parentSessionId?: string | null;
  projectId: string;
  provider?: string | null;
  retryOfRunId?: string | null;
  role?: string | null;
  specialistId?: string;
  taskId?: string | null;
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

interface PromptSessionInput {
  eventId?: string;
  prompt: string;
  timeoutMs?: number;
  traceId?: string;
}

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
      'Set runtime profile defaultProviderId or pass provider explicitly.',
  });
}

async function resolveAcpSessionDefaults(
  sqlite: Database,
  input: {
    model?: string | null;
    projectId: string;
    provider?: string | null;
  },
): Promise<{
  model: string | null;
  provider: string;
}> {
  const runtimeProfile = await getProjectRuntimeProfile(
    sqlite,
    input.projectId,
  );
  const providerId =
    normalizeOptionalText(input.provider) ??
    normalizeOptionalText(runtimeProfile.defaultProviderId);

  if (!providerId) {
    throwSessionProviderNotConfigured(input.projectId);
  }

  return {
    model:
      normalizeOptionalText(input.model) ??
      normalizeOptionalText(runtimeProfile.defaultModel),
    provider: normalizeAcpProviderId(providerId),
  };
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
  const session = getSessionRow(sqlite, sessionId);
  const taskRun = getLatestTaskExecutionRun(sqlite, sessionId);
  if (!taskRun) {
    return;
  }

  const outcome = buildTaskExecutionOutcome(
    sqlite,
    sessionId,
    state,
    fallbackFailureReason ?? session.failure_reason,
  );

  updateTaskExecutionState(sqlite, {
    taskId: taskRun.task_id,
    executionSessionId: null,
    resultSessionId: sessionId,
    completionSummary: outcome.summary,
    verificationReport: outcome.verificationReport,
    verificationVerdict: outcome.verificationVerdict,
    status: taskStatusOverride ?? state,
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

  if (state === 'COMPLETED') {
    await completeTaskRun(sqlite, taskRun.id, runInput, {
      logger: options.logger,
      reason: 'task_execution_completed',
      source: options.source ?? 'acp-service',
    });
    return;
  }

  if (state === 'FAILED') {
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
    failureReason?: string | null;
    lastActivityAt?: string | null;
    lastEventId?: string | null;
    name?: string | null;
    runtimeSessionId?: string | null;
    startedAt?: string | null;
    state?: AcpSessionState;
  },
) {
  const current = getSessionRow(sqlite, sessionId);
  sqlite
    .prepare(
      `
        UPDATE project_acp_sessions
        SET
          name = @name,
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
      runtimeSessionId: update.runtimeSessionId ?? current.runtime_session_id,
      acpStatus:
        update.acpStatus === undefined ? current.acp_status : update.acpStatus,
      acpError:
        update.acpError === undefined ? current.acp_error : update.acpError,
      state: update.state ?? current.state,
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

  sqlite
    .prepare(
      `
        INSERT OR IGNORE INTO project_acp_session_events (
          event_id,
          session_id,
          type,
          payload_json,
          error_json,
          emitted_at,
          created_at
        )
        VALUES (
          @eventId,
          @sessionId,
          @type,
          @payloadJson,
          @errorJson,
          @emittedAt,
          @createdAt
        )
      `,
    )
    .run({
      eventId: event.eventId,
      sessionId: event.sessionId,
      type: update.eventType,
      payloadJson: JSON.stringify(update),
      errorJson: event.error ? JSON.stringify(event.error) : null,
      emittedAt: event.emittedAt,
      createdAt: emittedAt,
    });

  updateSessionRuntime(sqlite, input.sessionId, {
    lastActivityAt: emittedAt,
    lastEventId: event.eventId,
  });

  broker.publish(event);
  return event;
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

function buildBootstrapPrompt(
  systemPrompt: string,
  userPrompt: string,
): string {
  return [`System:\n${systemPrompt.trim()}`, `User:\n${userPrompt}`].join(
    '\n\n',
  );
}

function resolveSessionCwd(repoPath: string | null): string {
  const cwd = repoPath?.trim();
  if (!cwd || !isAbsolute(cwd)) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-project-workspace-missing',
      title: 'ACP Project Workspace Missing',
      status: 409,
      detail:
        'ACP sessions require project.repoPath to be set to an absolute local path',
    });
  }

  return cwd;
}

function resolveLocalMcpServers(): McpServer[] {
  const host = process.env.HOST?.trim() || '127.0.0.1';
  const port = process.env.PORT?.trim();

  if (!port) {
    return [];
  }

  const headers = [
    {
      name: 'X-TeamAI-MCP-Access-Mode',
      value: 'read-write',
    },
    ...(process.env.DESKTOP_SESSION_TOKEN?.trim()
      ? [
          {
            name: 'Authorization',
            value: `Bearer ${process.env.DESKTOP_SESSION_TOKEN.trim()}`,
          },
        ]
      : []),
  ];

  return [
    {
      type: 'http',
      name: 'team_ai_local',
      url: `http://${host}:${port}/api/mcp`,
      headers,
    },
  ];
}

export function resolveSessionStateFromNormalizedUpdate(
  update: NormalizedSessionUpdate,
  fallback: AcpSessionState,
): AcpSessionState {
  switch (update.eventType) {
    case 'agent_message':
    case 'agent_thought':
    case 'tool_call':
    case 'terminal_created':
    case 'terminal_output':
    case 'terminal_exited':
      return 'RUNNING';
    case 'tool_call_update':
      return update.toolCall?.status === 'failed' ? 'FAILED' : 'RUNNING';
    case 'turn_complete':
      return update.turnComplete?.state ?? fallback;
    default:
      return fallback;
  }
}

export function extractSessionMetadataFromNormalizedUpdate(
  update: NormalizedSessionUpdate,
): {
  title: string | null;
  updatedAt: string | null;
} {
  if (update.eventType !== 'session_info_update') {
    return {
      title: null,
      updatedAt: null,
    };
  }

  return {
    title: update.sessionInfo?.title ?? null,
    updatedAt: update.sessionInfo?.updatedAt ?? null,
  };
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

async function updateSessionFromPromptResponse(
  sqlite: Database,
  broker: AcpStreamBroker,
  sessionId: string,
  response: PromptResponse,
  options: AcpServiceOptions = {},
) {
  let state: AcpSessionState = 'RUNNING';
  if (response.stopReason === 'cancelled') {
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
          ...(state === 'CANCELLED' ? { state } : {}),
        },
      },
    ),
  });

  updateSessionRuntime(sqlite, sessionId, {
    acpStatus: 'ready',
    acpError: null,
    state,
    failureReason: null,
    completedAt: state === 'CANCELLED' ? completedAt : null,
    lastActivityAt: completedAt,
  });

  await syncTaskExecutionOutcome(
    sqlite,
    sessionId,
    state === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED',
    undefined,
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
  const { model, provider } = await resolveAcpSessionDefaults(sqlite, input);
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

  const role = taskRole ?? requestedRole;
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
  const agent = specialist
    ? await createAgent(sqlite, {
        projectId: input.projectId,
        name: specialist.name,
        role: specialist.role,
        provider,
        model: specialist.modelTier ?? 'default',
        systemPrompt: specialist.systemPrompt,
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

export async function deleteAcpSession(
  sqlite: Database,
  runtime: AcpRuntimeClient,
  sessionId: string,
): Promise<void> {
  getSessionRow(sqlite, sessionId);
  await runtime.deleteSession(sessionId);
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
  updateSessionRuntime(sqlite, sessionId, {
    acpStatus: 'ready',
    acpError: null,
    state: 'RUNNING',
    failureReason: null,
    completedAt: null,
    lastActivityAt: new Date().toISOString(),
  });

  try {
    const runtimeResult = await runtime.promptSession({
      localSessionId: sessionId,
      prompt: effectivePrompt,
      eventId: input.eventId,
      timeoutMs: input.timeoutMs,
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
    updateSessionRuntime(sqlite, sessionId, {
      acpStatus: 'error',
      acpError: message,
      state: 'FAILED',
      failureReason: message,
      completedAt: new Date().toISOString(),
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
