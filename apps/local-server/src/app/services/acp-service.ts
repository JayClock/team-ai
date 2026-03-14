import type { Database } from 'better-sqlite3';
import { isAbsolute } from 'node:path';
import { customAlphabet } from 'nanoid';
import type {
  McpServer,
  PromptResponse,
} from '@agentclientprotocol/sdk';
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
  AcpSessionListPayload,
  AcpSessionPayload,
  AcpSessionStatus,
  AcpSessionState,
  AcpEventTypePayload,
} from '../schemas/acp';
import type { RoleValue } from '../schemas/role';
import { normalizeAcpProviderId } from './acp-provider-service';
import {
  extractSessionMetadataFromNormalizedUpdate,
  normalizeSessionNotification,
  resolveSessionStateFromNormalizedUpdate,
  toPersistedAcpEvent,
} from './normalized-session-update';
import { createAgent } from './agent-service';
import { getProjectById } from './project-service';
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
  completed_at: string | null;
  cwd: string | null;
  failure_reason: string | null;
  id: string;
  last_activity_at: string | null;
  last_event_id: string | null;
  name: string | null;
  parent_session_id: string | null;
  project_id: string;
  provider: string;
  runtime_session_id: string | null;
  specialist_id: string | null;
  started_at: string | null;
  state: AcpSessionState;
  task_id?: string | null;
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
  cwd?: string | null;
  goal?: string;
  parentSessionId?: string | null;
  projectId: string;
  provider: string;
  retryOfRunId?: string | null;
  role?: string | null;
  specialistId?: string;
  taskId?: string | null;
}

interface TaskExecutionRow {
  assigned_role: string | null;
  assigned_specialist_id: string | null;
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
}

interface TaskExecutionRunRow {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
}

interface SessionHistorySummaryRow {
  error_json: string | null;
  payload_json: string;
  type: AcpEventTypePayload;
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
          completion_summary,
          status,
          kind,
          execution_session_id,
          result_session_id,
          verification_report,
          verification_verdict
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
  taskId: string,
  sessionId: string,
): TaskExecutionRunRow | null {
  return (
    (sqlite
      .prepare(
        `
          SELECT id, status
          FROM project_task_runs
          WHERE task_id = ?
            AND session_id = ?
            AND deleted_at IS NULL
          ORDER BY created_at DESC, updated_at DESC
          LIMIT 1
        `,
      )
      .get(taskId, sessionId) as TaskExecutionRunRow | undefined) ?? null
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
    const payload = parseEventRecord(row.payload_json);
    const error = parseEventRecord(row.error_json);

    if (row.type === 'message' && payload.role === 'assistant') {
      const content = extractEventText(payload.content);
      if (!content) {
        continue;
      }

      const messageId =
        extractEventText(payload.messageId) ??
        `assistant-${anonymousAssistantIndex++}`;
      const previous = assistantMessages.get(messageId) ?? '';

      if (!assistantMessages.has(messageId)) {
        assistantOrder.push(messageId);
      }

      assistantMessages.set(messageId, `${previous}${content}`);
      continue;
    }

    if (row.type === 'tool_result') {
      const rawOutput = extractEventText(payload.rawOutput);
      if (rawOutput) {
        toolOutputs.push(rawOutput);
      }
      continue;
    }

    if (row.type === 'error') {
      lastErrorMessage =
        extractEventText(payload.message) ??
        extractEventText(error.message) ??
        lastErrorMessage;
      continue;
    }

    if (row.type === 'complete') {
      const completionReason = extractEventText(payload.reason);
      const stopReason = extractEventText(payload.stopReason);
      cancelReason =
        completionReason ??
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
  if (!session.task_id) {
    return;
  }

  const outcome = buildTaskExecutionOutcome(
    sqlite,
    sessionId,
    state,
    fallbackFailureReason ?? session.failure_reason,
  );

  updateTaskExecutionState(sqlite, {
    taskId: session.task_id,
    executionSessionId: null,
    resultSessionId: sessionId,
    completionSummary: outcome.summary,
    verificationReport: outcome.verificationReport,
    verificationVerdict: outcome.verificationVerdict,
    status: taskStatusOverride ?? state,
  });

  const taskRun = getLatestTaskExecutionRun(sqlite, session.task_id, sessionId);
  if (!taskRun) {
    logDiagnostic(
      options.logger,
      'warn',
      {
        event: 'task.run.transition.missing',
        projectId: session.project_id,
        reason: 'task_execution_outcome_missing_run',
        sessionId,
        source: options.source ?? 'acp-service',
        state,
        taskId: session.task_id,
      },
      'Task execution outcome did not find a matching task run',
    );

    return;
  }

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
    parentSession: row.parent_session_id ? { id: row.parent_session_id } : null,
    name: row.name,
    provider: row.provider,
    specialistId: row.specialist_id,
    cwd: row.cwd ?? '',
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    completedAt: row.completed_at,
    failureReason: row.failure_reason,
    lastEventId: row.last_event_id ? { id: row.last_event_id } : null,
  };
}

function mapEventRow(row: AcpEventRow): AcpEventEnvelopePayload {
  return {
    eventId: row.event_id,
    sessionId: row.session_id,
    type: row.type as AcpEventTypePayload,
    emittedAt: row.emitted_at,
    data: JSON.parse(row.payload_json) as Record<string, unknown>,
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
          parent_session_id,
          name,
          provider,
          cwd,
          acp_status,
          acp_error,
          state,
          runtime_session_id,
          specialist_id,
          task_id,
          failure_reason,
          last_event_id,
          started_at,
          last_activity_at,
          completed_at
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

function appendLocalEvent(
  sqlite: Database,
  broker: AcpStreamBroker,
  input: {
    error?: AcpEventErrorPayload | null;
    eventId?: string;
    payload: Record<string, unknown>;
    sessionId: string;
    type: AcpEventTypePayload;
  },
): AcpEventEnvelopePayload {
  const emittedAt = new Date().toISOString();
  const event: AcpEventEnvelopePayload = {
    eventId: input.eventId ?? createEventId(),
    sessionId: input.sessionId,
    type: input.type,
    emittedAt,
    data: input.payload,
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
      type: event.type,
      payloadJson: JSON.stringify(event.data),
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
        WHERE session_id = ? AND type = 'message'
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

function createRuntimeHooks(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  localSessionId: string,
  options: AcpServiceOptions = {},
): AcpRuntimeSessionHooks {
  return {
    async onSessionUpdate(notification) {
      const current = getSessionRow(sqlite, localSessionId);
      const normalized = normalizeSessionNotification(
        localSessionId,
        current.provider,
        notification,
      );
      if (!normalized) {
        return;
      }
      const persisted = toPersistedAcpEvent(normalized);
      const emitted = appendLocalEvent(sqlite, broker, {
        sessionId: localSessionId,
        type: persisted.type,
        payload: persisted.payload,
      });

      const state = resolveSessionStateFromNormalizedUpdate(
        normalized,
        current.state,
      );
      const metadata = extractSessionMetadataFromNormalizedUpdate(normalized);
      updateSessionRuntime(sqlite, localSessionId, {
        acpError:
          state === 'FAILED' ? emitted.error?.message ?? current.acp_error : null,
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

      if (persisted.type === 'plan') {
        appendLocalEvent(sqlite, broker, {
          sessionId: localSessionId,
          type: 'status',
          payload: {
            source: 'local-server',
            reason: 'plan_sync_disabled',
            planEventId: emitted.eventId,
            message:
              'ACP plan events no longer create or dispatch project tasks automatically.',
          },
        });
      }
    },
    async onClosed(error) {
      const current = getSessionRow(sqlite, localSessionId);
      if (!error) {
        return;
      }

      if (
        current.state === 'CANCELLED' ||
        current.state === 'FAILED'
      ) {
        return;
      }

      appendLocalEvent(sqlite, broker, {
        sessionId: localSessionId,
        type: 'error',
        payload: {
          source: 'acp-sdk',
          message: error.message,
        },
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
  prompt: string,
  eventId?: string,
) {
  appendLocalEvent(sqlite, broker, {
    sessionId,
    eventId,
    type: 'message',
    payload: {
      source: 'local-server',
      role: 'user',
      content: prompt,
    },
  });

  appendLocalEvent(sqlite, broker, {
    sessionId,
    type: 'status',
    payload: {
      source: 'local-server',
      state: 'RUNNING',
      reason: 'prompt_requested',
    },
  });
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
  if (response.stopReason === 'cancelled') {
    state = 'CANCELLED';
  }

  const completedAt = new Date().toISOString();
  appendLocalEvent(sqlite, broker, {
    sessionId,
    type: 'complete',
    payload: {
      source: 'acp-sdk',
      stopReason: response.stopReason,
      userMessageId: response.userMessageId ?? null,
      usage: response.usage ?? null,
      ...(state === 'CANCELLED' ? { state } : {}),
    },
  });

  updateSessionRuntime(sqlite, sessionId, {
    acpStatus: 'ready',
    acpError: null,
    state,
    failureReason: null,
    completedAt: state === 'CANCELLED' ? completedAt : null,
    lastActivityAt: completedAt,
  });

  if (session.task_id) {
    await syncTaskExecutionOutcome(
      sqlite,
      sessionId,
      state === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED',
      undefined,
      options,
    );
  }
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
  const provider = normalizeAcpProviderId(input.provider);
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

  const cwd = resolveSessionCwd(input.cwd ?? project.repoPath ?? null);
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
          parent_session_id,
          specialist_id,
          name,
          provider,
          cwd,
          acp_status,
          acp_error,
          state,
          runtime_session_id,
          task_id,
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
          @parentSessionId,
          @specialistId,
          @name,
          @provider,
          @cwd,
          @acpStatus,
          @acpError,
          @state,
          NULL,
          @taskId,
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
      parentSessionId: input.parentSessionId ?? null,
      specialistId: specialist?.id ?? null,
      name: input.goal?.trim() || null,
      provider,
      cwd,
      acpStatus: 'connecting',
      acpError: null,
      state: 'PENDING',
      taskId: task?.id ?? null,
      startedAt: now,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });

  try {
    const runtimeSession = await runtime.createSession({
      localSessionId: sessionId,
      provider,
      cwd,
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
      type: 'error',
      payload: {
        source: 'local-server',
        message,
        reason: 'session_create_failed',
      },
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

  appendLocalEvent(sqlite, broker, {
    sessionId,
    type: 'session',
    payload: {
      source: 'local-server',
      provider,
      role: (specialist?.role ?? role) as RoleValue | null,
      agentId: agent?.id ?? null,
      agentName: agent?.name ?? null,
      agentRole: agent?.role ?? null,
      specialistId: specialist?.id ?? null,
      taskId: task?.id ?? null,
      taskKind: task?.kind ?? null,
      cwd,
      state: 'PENDING',
      reason: 'session_created',
    },
  });

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
          parent_session_id,
          specialist_id,
          name,
          provider,
          cwd,
          acp_status,
          acp_error,
          state,
          runtime_session_id,
          task_id,
          failure_reason,
          last_event_id,
          started_at,
          last_activity_at,
          completed_at
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
      type: 'error',
      payload: {
        source: 'acp-sdk',
        message,
      },
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

    if (session.task_id) {
      await syncTaskExecutionOutcome(
        sqlite,
        sessionId,
        'FAILED',
        message,
        options,
        recovery.taskStatus,
      );
    }

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
    type: 'complete',
    payload: {
      source: 'local-server',
      reason: reason ?? 'cancel-requested',
      state: 'CANCELLED',
    },
  });
  updateSessionRuntime(sqlite, sessionId, {
    acpStatus: 'ready',
    acpError: null,
    state: 'CANCELLED',
    completedAt: new Date().toISOString(),
    failureReason: reason ?? null,
  });

  if (session.task_id) {
    await syncTaskExecutionOutcome(
      sqlite,
      sessionId,
      'CANCELLED',
      reason,
      options,
    );
  }

  return await getAcpSessionById(sqlite, sessionId);
}
