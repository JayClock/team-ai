import type { Database } from 'better-sqlite3';
import { ProblemError } from '@orchestration/runtime-acp';
import type {
  AcpEventUpdatePayload,
  DiagnosticLogger,
} from '@orchestration/runtime-acp';
import {
  cancelTaskRun,
  completeTaskRun,
  failTaskRun,
  startTaskRun,
} from './task-run-service';
import {
  flushAcpSessionEventWriteBuffer,
} from './acp-session-event-write-buffer';
import { getSessionRow } from './acp-session-store';

export interface TaskExecutionRow {
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

interface AcpSessionTaskSyncOptions {
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

function throwTaskNotFound(taskId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-not-found',
    title: 'Task Not Found',
    status: 404,
    detail: `Task ${taskId} was not found`,
  });
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

export function getTaskExecutionRow(
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

export function updateTaskExecutionState(
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

export function classifyTaskExecutionFailure(
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

export async function recordTaskExecutionCreationFailure(
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
  options: AcpSessionTaskSyncOptions = {},
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

export async function syncTaskExecutionOutcome(
  sqlite: Database,
  sessionId: string,
  state: 'COMPLETED' | 'FAILED' | 'CANCELLED',
  fallbackFailureReason?: string | null,
  options: AcpSessionTaskSyncOptions = {},
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
