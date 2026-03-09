import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import type { AgentGatewayClient } from '../clients/agent-gateway-client';
import { ProblemError } from '../errors/problem-error';
import type { OrchestrationStreamBroker } from '../plugins/orchestration-stream';
import type {
  OrchestrationArtifactPayload,
  OrchestrationEventPayload,
  OrchestrationSessionListPayload,
  OrchestrationSessionPayload,
  OrchestrationStepPayload,
  SessionStatus,
  StepKind,
  StepStatus,
} from '../schemas/orchestration';
import { createOrchestrationArtifact, listArtifactsBySession } from './orchestration-artifact-service';
import {
  executeOrchestrationStepViaGateway,
  resumeOrchestrationStepViaGateway,
  type OrchestrationGatewayExecutionResult,
} from './orchestration-step-executor';
import { getProjectById } from './project-service';
import {
  getCancelableStepStatuses,
  getRecoverableSessionStatuses,
  isRetryableStepStatus,
  shouldFailSessionForWaitingRetry,
} from './orchestration-recovery-service';

const sessionIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);
const stepIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);
const eventIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

const stepExecutionDelayMs = 40;

interface SessionRow {
  created_at: string;
  execution_mode: string;
  goal: string;
  id: string;
  provider: string;
  project_id: string;
  status: SessionStatus;
  strategy_json: string;
  title: string;
  trace_id: string | null;
  updated_at: string;
  workspace_root: string | null;
}

interface StepRow {
  attempt: number;
  completed_at: string | null;
  created_at: string;
  depends_on_json: string;
  error_code: string | null;
  error_message: string | null;
  id: string;
  input_json: string | null;
  kind: StepKind;
  max_attempts: number;
  output_json: string | null;
  role: string | null;
  runtime_cursor: string | null;
  runtime_session_id: string | null;
  session_id: string;
  started_at: string | null;
  status: StepStatus;
  title: string;
  updated_at: string;
}

interface EventRow {
  at: string;
  id: string;
  payload_json: string;
  session_id: string;
  step_id: string | null;
  type: OrchestrationEventPayload['type'];
}

interface SessionRunner {
  cancelled: boolean;
  running: boolean;
}

interface ListOrchestrationSessionsQuery {
  page: number;
  pageSize: number;
  projectId?: string;
  status?: SessionStatus;
}

interface CreateOrchestrationSessionInput {
  executionMode?: string;
  goal: string;
  provider?: string;
  projectId: string;
  traceId?: string;
  title: string;
  workspaceRoot?: string;
}

interface ArtifactRow {
  content_json: string;
  created_at: string;
  id: string;
  kind: string;
  session_id: string;
  step_id: string;
  updated_at: string;
}

const sessionRunners = new Map<string, SessionRunner>();

function launchSessionSchedule(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  sessionId: string,
  agentGatewayClient?: AgentGatewayClient,
) {
  if (!agentGatewayClient?.isConfigured()) {
    return;
  }

  void scheduleOrchestrationSession(
    sqlite,
    broker,
    sessionId,
    agentGatewayClient,
  ).catch((error) => {
    console.error(
      `[orchestration] failed to schedule session ${sessionId}`,
      error,
    );
  });
}

function createSessionId() {
  return `orc_${sessionIdGenerator()}`;
}

function createStepId() {
  return `step_${stepIdGenerator()}`;
}

function createEventId() {
  return `evt_${eventIdGenerator()}`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function throwSessionNotFound(sessionId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/orchestration-session-not-found',
    title: 'Orchestration Session Not Found',
    status: 404,
    detail: `Orchestration session ${sessionId} was not found`,
  });
}

function throwStepNotFound(stepId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/orchestration-step-not-found',
    title: 'Orchestration Step Not Found',
    status: 404,
    detail: `Orchestration step ${stepId} was not found`,
  });
}

function throwInvalidState(detail: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/orchestration-invalid-state',
    title: 'Invalid Orchestration State',
    status: 409,
    detail,
  });
}

function mapArtifactRow(row: ArtifactRow): OrchestrationArtifactPayload {
  return {
    id: row.id,
    sessionId: row.session_id,
    stepId: row.step_id,
    kind: row.kind,
    content: JSON.parse(row.content_json) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listArtifactsForStep(
  sqlite: Database,
  stepId: string,
): OrchestrationArtifactPayload[] {
  const rows = sqlite
    .prepare(
      `
        SELECT
          id,
          session_id,
          step_id,
          kind,
          content_json,
          created_at,
          updated_at
        FROM orchestration_artifacts
        WHERE step_id = ?
        ORDER BY created_at ASC
      `,
    )
    .all(stepId) as ArtifactRow[];

  return rows.map(mapArtifactRow);
}

function mapStepRow(
  sqlite: Database,
  row: StepRow,
): OrchestrationStepPayload {
  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    dependsOn: JSON.parse(row.depends_on_json) as string[],
    role: row.role,
    input: row.input_json
      ? (JSON.parse(row.input_json) as Record<string, unknown>)
      : null,
    output: row.output_json
      ? (JSON.parse(row.output_json) as Record<string, unknown>)
      : null,
    runtimeSessionId: row.runtime_session_id,
    runtimeCursor: row.runtime_cursor,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    artifacts: listArtifactsForStep(sqlite, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEventRow(row: EventRow): OrchestrationEventPayload {
  return {
    id: row.id,
    sessionId: row.session_id,
    stepId: row.step_id ?? undefined,
    type: row.type,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    at: row.at,
  };
}

function countSteps(sqlite: Database, sessionId: string) {
  const counts = sqlite
    .prepare(
      `
        SELECT status, COUNT(*) AS count
        FROM orchestration_steps
        WHERE session_id = ?
        GROUP BY status
      `,
    )
    .all(sessionId) as Array<{ count: number; status: StepStatus }>;

  return counts.reduce(
    (accumulator, row) => {
      accumulator.total += row.count;

      if (row.status === 'COMPLETED') {
        accumulator.completed += row.count;
      }

      if (row.status === 'FAILED') {
        accumulator.failed += row.count;
      }

      if (row.status === 'RUNNING') {
        accumulator.running += row.count;
      }

      return accumulator;
    },
    {
      completed: 0,
      failed: 0,
      running: 0,
      total: 0,
    },
  );
}

function resolveCurrentPhase(sqlite: Database, sessionId: string): StepKind | null {
  const steps = listSessionStepRows(sqlite, sessionId);
  const activeStep =
    steps.find((step) => step.status === 'RUNNING') ??
    steps.find((step) => step.status === 'READY') ??
    steps.find((step) => step.status === 'WAITING_RETRY');

  if (activeStep) {
    return activeStep.kind;
  }

  const latestCompletedStep = [...steps]
    .reverse()
    .find((step) => step.status === 'COMPLETED');

  return latestCompletedStep?.kind ?? null;
}

function resolveLastEventAt(sqlite: Database, sessionId: string): string | null {
  const row = sqlite
    .prepare(
      `
        SELECT at
        FROM orchestration_events
        WHERE session_id = ?
        ORDER BY at DESC
        LIMIT 1
      `,
    )
    .get(sessionId) as { at: string } | undefined;

  return row?.at ?? null;
}

function mapSessionRow(
  sqlite: Database,
  row: SessionRow,
): OrchestrationSessionPayload {
  return {
    id: row.id,
    projectId: row.project_id,
    provider: row.provider,
    workspaceRoot: row.workspace_root,
    executionMode: row.execution_mode,
    currentPhase: resolveCurrentPhase(sqlite, row.id),
    lastEventAt: resolveLastEventAt(sqlite, row.id),
    traceId: row.trace_id ?? undefined,
    title: row.title,
    goal: row.goal,
    status: row.status,
    strategy: JSON.parse(row.strategy_json) as OrchestrationSessionPayload['strategy'],
    stepCounts: countSteps(sqlite, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getSessionRow(sqlite: Database, sessionId: string): SessionRow {
  const row = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          provider,
          workspace_root,
          execution_mode,
          trace_id,
          title,
          goal,
          status,
          strategy_json,
          created_at,
          updated_at
        FROM orchestration_sessions
        WHERE id = ?
      `,
    )
    .get(sessionId) as SessionRow | undefined;

  if (!row) {
    throwSessionNotFound(sessionId);
  }

  return row;
}

function getStepRow(sqlite: Database, stepId: string): StepRow {
  const row = sqlite
    .prepare(
      `
        SELECT
          id,
          session_id,
          title,
          kind,
          status,
          attempt,
          max_attempts,
          depends_on_json,
          role,
          input_json,
          output_json,
          runtime_session_id,
          runtime_cursor,
          started_at,
          completed_at,
          error_code,
          error_message,
          created_at,
          updated_at
        FROM orchestration_steps
        WHERE id = ?
      `,
    )
    .get(stepId) as StepRow | undefined;

  if (!row) {
    throwStepNotFound(stepId);
  }

  return row;
}

function listSessionStepRows(sqlite: Database, sessionId: string): StepRow[] {
  return sqlite
    .prepare(
      `
        SELECT
          id,
          session_id,
          title,
          kind,
          status,
          attempt,
          max_attempts,
          depends_on_json,
          role,
          input_json,
          output_json,
          runtime_session_id,
          runtime_cursor,
          started_at,
          completed_at,
          error_code,
          error_message,
          created_at,
          updated_at
        FROM orchestration_steps
        WHERE session_id = ?
        ORDER BY order_index ASC
      `,
    )
    .all(sessionId) as StepRow[];
}

function listSessionEventRows(sqlite: Database, sessionId: string): EventRow[] {
  return sqlite
    .prepare(
      `
        SELECT
          id,
          session_id,
          step_id,
          type,
          payload_json,
          at
        FROM orchestration_events
        WHERE session_id = ?
        ORDER BY at ASC
      `,
    )
    .all(sessionId) as EventRow[];
}

function writeSessionStatus(
  sqlite: Database,
  sessionId: string,
  status: SessionStatus,
) {
  sqlite
    .prepare(
      `
        UPDATE orchestration_sessions
        SET
          status = @status,
          updated_at = @updatedAt
        WHERE id = @id
      `,
    )
    .run({
      id: sessionId,
      status,
      updatedAt: new Date().toISOString(),
    });
}

function writeStepStatus(
  sqlite: Database,
  stepId: string,
  status: StepStatus,
  options?: { incrementAttempt?: boolean },
) {
  const step = getStepRow(sqlite, stepId);

  sqlite
    .prepare(
      `
        UPDATE orchestration_steps
        SET
          status = @status,
          attempt = @attempt,
          updated_at = @updatedAt
        WHERE id = @id
      `,
    )
    .run({
      id: stepId,
      status,
      attempt: options?.incrementAttempt ? step.attempt + 1 : step.attempt,
      updatedAt: new Date().toISOString(),
    });
}

function appendEvent(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  input: {
    payload: Record<string, unknown>;
    sessionId: string;
    stepId?: string;
    type: OrchestrationEventPayload['type'];
  },
): OrchestrationEventPayload {
  const event: OrchestrationEventPayload = {
    id: createEventId(),
    sessionId: input.sessionId,
    stepId: input.stepId,
    type: input.type,
    payload: input.payload,
    at: new Date().toISOString(),
  };

  sqlite
    .prepare(
      `
        INSERT INTO orchestration_events (
          id,
          session_id,
          step_id,
          type,
          payload_json,
          at
        )
        VALUES (
          @id,
          @sessionId,
          @stepId,
          @type,
          @payloadJson,
          @at
        )
      `,
    )
    .run({
      id: event.id,
      sessionId: event.sessionId,
      stepId: event.stepId ?? null,
      type: event.type,
      payloadJson: JSON.stringify(event.payload),
      at: event.at,
    });

  broker.publish(event);

  return event;
}

function getNextReadyStep(sqlite: Database, sessionId: string): StepRow | undefined {
  return sqlite
    .prepare(
      `
        SELECT
          id,
          session_id,
          title,
          kind,
          status,
          attempt,
          max_attempts,
          depends_on_json,
          role,
          input_json,
          output_json,
          runtime_session_id,
          runtime_cursor,
          started_at,
          completed_at,
          error_code,
          error_message,
          created_at,
          updated_at
        FROM orchestration_steps
        WHERE session_id = @sessionId AND status = 'READY'
        ORDER BY order_index ASC
        LIMIT 1
      `,
    )
    .get({ sessionId }) as StepRow | undefined;
}

function refreshReadySteps(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  sessionId: string,
) {
  const steps = listSessionStepRows(sqlite, sessionId);
  const statusByStepId = new Map(
    steps.map((step) => [step.id, step.status] as const),
  );

  for (const step of steps) {
    if (step.status !== 'PENDING') {
      continue;
    }

    const dependsOn = JSON.parse(step.depends_on_json) as string[];
    const allCompleted = dependsOn.every(
      (dependencyId) => statusByStepId.get(dependencyId) === 'COMPLETED',
    );

    if (!allCompleted) {
      continue;
    }

    writeStepStatus(sqlite, step.id, 'READY');
    appendEvent(sqlite, broker, {
      sessionId,
      stepId: step.id,
      type: 'step.ready',
      payload: {
        kind: step.kind,
      },
    });
  }
}

function finalizeSessionIfComplete(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  sessionId: string,
): boolean {
  const steps = listSessionStepRows(sqlite, sessionId);
  const hasRunning = steps.some((step) => step.status === 'RUNNING');
  const hasFailed = steps.some((step) => step.status === 'FAILED');
  const hasWaitingRetry = shouldFailSessionForWaitingRetry(
    steps.map((step) => step.status),
  );
  const hasPending = steps.some(
    (step) => step.status === 'PENDING' || step.status === 'READY',
  );

  if (hasFailed || hasWaitingRetry) {
    writeSessionStatus(sqlite, sessionId, 'FAILED');
    appendEvent(sqlite, broker, {
      sessionId,
      type: 'session.failed',
      payload: {
        reason: hasWaitingRetry ? 'step-waiting-retry' : 'step-failed',
      },
    });
    return true;
  }

  if (hasRunning || hasPending) {
    return false;
  }

  writeSessionStatus(sqlite, sessionId, 'COMPLETED');
  appendEvent(sqlite, broker, {
    sessionId,
    type: 'session.completed',
    payload: {},
  });
  return true;
}

function writeStepExecutionData(
  sqlite: Database,
  stepId: string,
  input: {
    completedAt?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    inputJson?: Record<string, unknown> | null;
    outputJson?: Record<string, unknown> | null;
    runtimeCursor?: string | null;
    runtimeSessionId?: string | null;
    startedAt?: string | null;
  },
) {
  const step = getStepRow(sqlite, stepId);
  const updatedAt = new Date().toISOString();

  sqlite
    .prepare(
      `
        UPDATE orchestration_steps
        SET
          input_json = @inputJson,
          output_json = @outputJson,
          runtime_session_id = @runtimeSessionId,
          runtime_cursor = @runtimeCursor,
          started_at = @startedAt,
          completed_at = @completedAt,
          error_code = @errorCode,
          error_message = @errorMessage,
          updated_at = @updatedAt
        WHERE id = @id
      `,
    )
    .run({
      id: stepId,
      inputJson: JSON.stringify(
        input.inputJson === undefined
          ? step.input_json
            ? (JSON.parse(step.input_json) as Record<string, unknown>)
            : null
          : input.inputJson,
      ),
      outputJson: JSON.stringify(
        input.outputJson === undefined
          ? step.output_json
            ? (JSON.parse(step.output_json) as Record<string, unknown>)
            : null
          : input.outputJson,
      ),
      runtimeSessionId:
        input.runtimeSessionId === undefined
          ? step.runtime_session_id
          : input.runtimeSessionId,
      runtimeCursor:
        input.runtimeCursor === undefined
          ? step.runtime_cursor
          : input.runtimeCursor,
      startedAt:
        input.startedAt === undefined ? step.started_at : input.startedAt,
      completedAt:
        input.completedAt === undefined ? step.completed_at : input.completedAt,
      errorCode:
        input.errorCode === undefined ? step.error_code : input.errorCode,
      errorMessage:
        input.errorMessage === undefined
          ? step.error_message
          : input.errorMessage,
      updatedAt,
    });
}

function buildGatewayEventPayload(event: Record<string, unknown>) {
  return {
    gatewayEvent: event,
  };
}

function resetStepForRetry(
  sqlite: Database,
  stepId: string,
  nextStatus: StepStatus,
  nextAttempt: number,
) {
  sqlite
    .prepare(
      `
        UPDATE orchestration_steps
        SET
          status = @status,
          attempt = @attempt,
          runtime_session_id = NULL,
          runtime_cursor = NULL,
          started_at = NULL,
          completed_at = NULL,
          error_code = NULL,
          error_message = NULL,
          output_json = NULL,
          updated_at = @updatedAt
        WHERE id = @id
      `,
    )
    .run({
      id: stepId,
      status: nextStatus,
      attempt: nextAttempt,
      updatedAt: new Date().toISOString(),
    });
}

function markStepWaitingRetry(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  sessionId: string,
  step: StepRow,
  input: {
    errorCode: string;
    errorMessage: string;
    reason: string;
  },
) {
  writeStepStatus(sqlite, step.id, 'WAITING_RETRY');
  writeStepExecutionData(sqlite, step.id, {
    completedAt: new Date().toISOString(),
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
  });
  appendEvent(sqlite, broker, {
    sessionId,
    stepId: step.id,
    type: 'step.failed',
    payload: {
      attempt: step.attempt,
      kind: step.kind,
      reason: input.reason,
      retryable: true,
      errorCode: input.errorCode,
      message: input.errorMessage,
    },
  });
}

async function applyExecutionResult(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  sessionId: string,
  step: StepRow,
  result: OrchestrationGatewayExecutionResult,
) {
  writeStepExecutionData(sqlite, step.id, {
    inputJson: result.prompt
      ? {
          artifactKind: result.prompt.artifactKind,
          promptVersion: result.prompt.version,
          systemPrompt: result.prompt.systemPrompt,
          userPrompt: result.prompt.userPrompt,
        }
      : undefined,
    runtimeCursor: result.runtimeCursor,
    runtimeSessionId: result.runtimeSessionId,
  });

  if (result.status === 'failed') {
    const waitingRetryCodes = new Set([
      'ORCHESTRATION_GATEWAY_TIMEOUT',
      'ORCHESTRATION_GATEWAY_FAILED',
      'ORCHESTRATION_GATEWAY_ERROR',
      'PROVIDER_TIMEOUT',
      'PROVIDER_PROCESS_EXITED',
      'PROVIDER_PROCESS_START_FAILED',
    ]);

    if (waitingRetryCodes.has(result.errorCode)) {
      markStepWaitingRetry(sqlite, broker, sessionId, step, {
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        reason: 'runtime-retry-required',
      });
      return;
    }

    if (result.errorCode === 'ORCHESTRATION_GATEWAY_CANCELLED') {
      writeStepStatus(sqlite, step.id, 'CANCELLED');
      writeStepExecutionData(sqlite, step.id, {
        completedAt: new Date().toISOString(),
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
      appendEvent(sqlite, broker, {
        sessionId,
        stepId: step.id,
        type: 'step.cancelled',
        payload: {
          attempt: step.attempt,
          kind: step.kind,
          runtimeSessionId: result.runtimeSessionId ?? null,
        },
      });
      return;
    }

    writeStepStatus(sqlite, step.id, 'FAILED');
    writeStepExecutionData(sqlite, step.id, {
      completedAt: new Date().toISOString(),
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    });
    appendEvent(sqlite, broker, {
      sessionId,
      stepId: step.id,
      type: 'step.failed',
      payload: {
        attempt: step.attempt,
        kind: step.kind,
        reason: result.errorCode,
        message: result.errorMessage,
        runtimeSessionId: result.runtimeSessionId ?? null,
        retryable: false,
      },
    });
    return;
  }

  await createOrchestrationArtifact(sqlite, {
    sessionId,
    stepId: step.id,
    kind: result.artifactKind,
    content: result.parsedOutput,
  });

  writeStepExecutionData(sqlite, step.id, {
    completedAt: new Date().toISOString(),
    outputJson: result.parsedOutput,
    runtimeCursor: result.runtimeCursor,
    runtimeSessionId: result.runtimeSessionId,
    errorCode: null,
    errorMessage: null,
  });

  if (step.kind === 'VERIFY' && result.parsedOutput.verdict === 'fail') {
    writeStepStatus(sqlite, step.id, 'FAILED');
    writeStepExecutionData(sqlite, step.id, {
      errorCode: 'VERIFICATION_FAILED',
      errorMessage:
        typeof result.parsedOutput.summary === 'string'
          ? result.parsedOutput.summary
          : 'Verification reported a failed verdict',
    });
    appendEvent(sqlite, broker, {
      sessionId,
      stepId: step.id,
      type: 'step.failed',
      payload: {
        attempt: step.attempt,
        kind: step.kind,
        reason: 'verification-failed',
        verdict: result.parsedOutput.verdict,
        runtimeSessionId: result.runtimeSessionId,
      },
    });
    return;
  }

  writeStepStatus(sqlite, step.id, 'COMPLETED');
  appendEvent(sqlite, broker, {
    sessionId,
    stepId: step.id,
    type: 'step.completed',
    payload: {
      attempt: step.attempt,
      artifactKind: result.artifactKind,
      kind: step.kind,
      runtimeSessionId: result.runtimeSessionId,
    },
  });
}

async function executeStep(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  runner: SessionRunner,
  sessionId: string,
  step: StepRow,
  agentGatewayClient: AgentGatewayClient,
) {
  if (runner.cancelled) {
    return;
  }

  writeSessionStatus(sqlite, sessionId, 'RUNNING');
  appendEvent(sqlite, broker, {
    sessionId,
    type: 'session.running',
    payload: {},
  });

  writeStepStatus(sqlite, step.id, 'RUNNING');
  appendEvent(sqlite, broker, {
    sessionId,
    stepId: step.id,
    type: 'step.started',
    payload: {
      attempt: step.attempt,
      kind: step.kind,
      role: step.role,
    },
  });
  writeStepExecutionData(sqlite, step.id, {
    startedAt: new Date().toISOString(),
    completedAt: null,
    errorCode: null,
    errorMessage: null,
  });

  const session = await getOrchestrationSessionById(sqlite, sessionId);
  const orchestrationStep = await getOrchestrationStepById(sqlite, step.id);
  const upstreamArtifacts = await listArtifactsBySession(sqlite, sessionId);

  try {
    const result = await executeOrchestrationStepViaGateway({
      agentGatewayClient,
      session,
      step: orchestrationStep,
      upstreamArtifacts,
      onRuntimeStarted: (runtimeSessionId) => {
        writeStepExecutionData(sqlite, step.id, {
          runtimeSessionId,
        });
      },
      onGatewayEvent: (event) => {
        writeStepExecutionData(sqlite, step.id, {
          runtimeCursor: event.cursor ?? null,
        });
        appendEvent(sqlite, broker, {
          sessionId,
          stepId: step.id,
          type: 'step.runtime.event',
          payload: buildGatewayEventPayload({
            cursor: event.cursor ?? null,
            data: event.data ?? {},
            error: event.error ?? null,
            eventId: event.eventId ?? null,
            emittedAt: event.emittedAt ?? null,
            sessionId: event.sessionId ?? null,
            traceId: event.traceId ?? null,
            type: event.type,
          }),
        });
      },
    });
    await applyExecutionResult(sqlite, broker, sessionId, step, result);
  } catch (error) {
    const detail =
      error instanceof ProblemError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unknown orchestration execution failure';
    writeStepStatus(sqlite, step.id, 'FAILED');
    writeStepExecutionData(sqlite, step.id, {
      completedAt: new Date().toISOString(),
      errorCode: 'ORCHESTRATION_EXECUTION_FAILED',
      errorMessage: detail,
    });
    appendEvent(sqlite, broker, {
      sessionId,
      stepId: step.id,
      type: 'step.failed',
      payload: {
        attempt: step.attempt,
        kind: step.kind,
        reason: 'ORCHESTRATION_EXECUTION_FAILED',
        message: detail,
      },
    });
  }
}

export async function scheduleOrchestrationSession(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  sessionId: string,
  agentGatewayClient?: AgentGatewayClient,
) {
  if (!agentGatewayClient?.isConfigured()) {
    return;
  }

  const runner = sessionRunners.get(sessionId) ?? {
    cancelled: false,
    running: false,
  };

  runner.cancelled = false;
  sessionRunners.set(sessionId, runner);

  if (runner.running) {
    return;
  }

  runner.running = true;

  try {
    while (!runner.cancelled) {
      const session = getSessionRow(sqlite, sessionId);

      if (
        session.status === 'CANCELLED' ||
        session.status === 'COMPLETED' ||
        session.status === 'FAILED'
      ) {
        break;
      }

      refreshReadySteps(sqlite, broker, sessionId);

      const nextStep = getNextReadyStep(sqlite, sessionId);

      if (!nextStep) {
        if (finalizeSessionIfComplete(sqlite, broker, sessionId)) {
          break;
        }

        await sleep(stepExecutionDelayMs);
        continue;
      }

      await executeStep(
        sqlite,
        broker,
        runner,
        sessionId,
        nextStep,
        agentGatewayClient,
      );

      const currentSession = getSessionRow(sqlite, sessionId);

      if (
        currentSession.status === 'FAILED' ||
        currentSession.status === 'CANCELLED' ||
        currentSession.status === 'COMPLETED'
      ) {
        break;
      }
    }
  } finally {
    runner.running = false;

    const session = getSessionRow(sqlite, sessionId);

    if (
      session.status === 'COMPLETED' ||
      session.status === 'CANCELLED' ||
      session.status === 'FAILED'
    ) {
      sessionRunners.delete(sessionId);
    } else {
      sessionRunners.set(sessionId, runner);
    }
  }
}

export async function createOrchestrationSession(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  input: CreateOrchestrationSessionInput,
  agentGatewayClient?: AgentGatewayClient,
) {
  await getProjectById(sqlite, input.projectId);

  const now = new Date().toISOString();
  const sessionId = createSessionId();
  const provider = input.provider?.trim() || 'codex';
  const executionMode = input.executionMode?.trim() || 'local';
  const strategy = {
    failFast: true,
    maxParallelism: 1,
    mode: 'planner-assisted',
  };
  const stepDefinitions: Array<{
    dependsOn: string[];
    id: string;
    kind: StepKind;
    role: string;
    title: string;
  }> = [
    {
      id: createStepId(),
      title: 'Analyze request',
      kind: 'PLAN',
      role: 'planner',
      dependsOn: [],
    },
    {
      id: createStepId(),
      title: 'Implement local changes',
      kind: 'IMPLEMENT',
      role: 'crafter',
      dependsOn: [],
    },
    {
      id: createStepId(),
      title: 'Verify result',
      kind: 'VERIFY',
      role: 'gate',
      dependsOn: [],
    },
  ];

  stepDefinitions[1].dependsOn = [stepDefinitions[0].id];
  stepDefinitions[2].dependsOn = [stepDefinitions[1].id];

  const transaction = sqlite.transaction(() => {
    sqlite
      .prepare(
        `
          INSERT INTO orchestration_sessions (
            id,
            project_id,
            provider,
            workspace_root,
            execution_mode,
            trace_id,
            title,
            goal,
            status,
            strategy_json,
            created_at,
            updated_at
          )
          VALUES (
            @id,
            @projectId,
            @provider,
            @workspaceRoot,
            @executionMode,
            @traceId,
            @title,
            @goal,
            @status,
            @strategyJson,
            @createdAt,
            @updatedAt
          )
        `,
      )
      .run({
        id: sessionId,
        projectId: input.projectId,
        provider,
        workspaceRoot: input.workspaceRoot?.trim() || null,
        executionMode,
        traceId: input.traceId?.trim() || null,
        title: input.title,
        goal: input.goal,
        status: 'PENDING',
        strategyJson: JSON.stringify(strategy),
        createdAt: now,
        updatedAt: now,
      });

    const insertStep = sqlite.prepare(
      `
        INSERT INTO orchestration_steps (
          id,
          session_id,
          title,
          kind,
          role,
          status,
          attempt,
          max_attempts,
          depends_on_json,
          input_json,
          output_json,
          runtime_session_id,
          runtime_cursor,
          started_at,
          completed_at,
          error_code,
          error_message,
          order_index,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          @sessionId,
          @title,
          @kind,
          @role,
          @status,
          @attempt,
          @maxAttempts,
          @dependsOnJson,
          @inputJson,
          @outputJson,
          @runtimeSessionId,
          @runtimeCursor,
          @startedAt,
          @completedAt,
          @errorCode,
          @errorMessage,
          @orderIndex,
          @createdAt,
          @updatedAt
        )
      `,
    );

    for (const [index, step] of stepDefinitions.entries()) {
      insertStep.run({
        id: step.id,
        sessionId,
        title: step.title,
        kind: step.kind,
        role: step.role,
        status: 'PENDING',
        attempt: 1,
        maxAttempts: 3,
        dependsOnJson: JSON.stringify(step.dependsOn),
        inputJson: null,
        outputJson: null,
        runtimeSessionId: null,
        runtimeCursor: null,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        orderIndex: index,
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  transaction();

  appendEvent(sqlite, broker, {
    sessionId,
    type: 'session.created',
    payload: {
      projectId: input.projectId,
      title: input.title,
      provider,
      executionMode,
      workspaceRoot: input.workspaceRoot?.trim() || null,
      traceId: input.traceId?.trim() || null,
    },
  });

  const session = await getOrchestrationSessionById(sqlite, sessionId);
  launchSessionSchedule(sqlite, broker, sessionId, agentGatewayClient);

  return {
    session,
  };
}

export async function listOrchestrationSessions(
  sqlite: Database,
  query: ListOrchestrationSessionsQuery,
): Promise<OrchestrationSessionListPayload> {
  const offset = (query.page - 1) * query.pageSize;
  const filters: string[] = [];
  const parameters: Record<string, unknown> = {
    limit: query.pageSize,
    offset,
  };

  if (query.projectId) {
    filters.push('project_id = @projectId');
    parameters.projectId = query.projectId;
  }

  if (query.status) {
    filters.push('status = @status');
    parameters.status = query.status;
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const rows = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          provider,
          workspace_root,
          execution_mode,
          trace_id,
          title,
          goal,
          status,
          strategy_json,
          created_at,
          updated_at
        FROM orchestration_sessions
        ${whereClause}
        ORDER BY updated_at DESC
        LIMIT @limit OFFSET @offset
      `,
    )
    .all(parameters) as SessionRow[];

  const total = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM orchestration_sessions
        ${whereClause}
      `,
    )
    .get(parameters) as { count: number };

  return {
    items: rows.map((row) => mapSessionRow(sqlite, row)),
    page: query.page,
    pageSize: query.pageSize,
    total: total.count,
  };
}

export async function getOrchestrationSessionById(
  sqlite: Database,
  sessionId: string,
) {
  return mapSessionRow(sqlite, getSessionRow(sqlite, sessionId));
}

export async function listOrchestrationSteps(
  sqlite: Database,
  sessionId: string,
) {
  getSessionRow(sqlite, sessionId);
  return listSessionStepRows(sqlite, sessionId).map((row) =>
    mapStepRow(sqlite, row),
  );
}

export async function getOrchestrationStepById(sqlite: Database, stepId: string) {
  return mapStepRow(sqlite, getStepRow(sqlite, stepId));
}

export async function listOrchestrationEvents(
  sqlite: Database,
  sessionId: string,
) {
  getSessionRow(sqlite, sessionId);
  return listSessionEventRows(sqlite, sessionId).map(mapEventRow);
}

export async function listStepEvents(sqlite: Database, stepId: string) {
  const step = getStepRow(sqlite, stepId);
  const events = sqlite
    .prepare(
      `
        SELECT
          id,
          session_id,
          step_id,
          type,
          payload_json,
          at
        FROM orchestration_events
        WHERE step_id = ?
        ORDER BY at ASC
      `,
    )
    .all(stepId) as EventRow[];

  return {
    sessionId: step.session_id,
    events: events.map(mapEventRow),
  };
}

export async function cancelOrchestrationSession(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  sessionId: string,
  agentGatewayClient?: AgentGatewayClient,
) {
  const session = getSessionRow(sqlite, sessionId);

  if (session.status === 'COMPLETED') {
    throwInvalidState(`Session ${sessionId} is already completed`);
  }

  const runner = sessionRunners.get(sessionId);

  if (runner) {
    runner.cancelled = true;
  }

  const steps = listSessionStepRows(sqlite, sessionId);
  const activeStep = steps.find(
    (step) => step.status === 'RUNNING' && step.runtime_session_id,
  );
  const activeRuntimeSessionId = activeStep?.runtime_session_id;

  if (agentGatewayClient?.isConfigured() && activeRuntimeSessionId) {
    try {
      await agentGatewayClient.cancel(activeRuntimeSessionId, {
        reason: 'orchestration-session-cancelled',
        traceId: session.trace_id ?? undefined,
      });
    } catch (error) {
      if (!(error instanceof ProblemError) || error.status !== 404) {
        throw error;
      }
    }
  }

  for (const step of steps) {
    if (!getCancelableStepStatuses().includes(step.status)) {
      continue;
    }

    writeStepStatus(sqlite, step.id, 'CANCELLED');
    writeStepExecutionData(sqlite, step.id, {
      completedAt: new Date().toISOString(),
      errorCode:
        step.id === activeStep?.id
          ? 'ORCHESTRATION_SESSION_CANCELLED'
          : step.error_code,
      errorMessage:
        step.id === activeStep?.id
          ? 'Cancelled by orchestration session request'
          : step.error_message,
    });
    appendEvent(sqlite, broker, {
      sessionId,
      stepId: step.id,
      type: 'step.cancelled',
      payload: {
        attempt: step.attempt,
        kind: step.kind,
        runtimeSessionId: step.runtime_session_id,
      },
    });
  }

  writeSessionStatus(sqlite, sessionId, 'CANCELLED');
  appendEvent(sqlite, broker, {
    sessionId,
    type: 'session.cancelled',
    payload: {
      runtimeSessionId: activeRuntimeSessionId ?? null,
    },
  });

  return {
    session: await getOrchestrationSessionById(sqlite, sessionId),
  };
}

export async function resumeOrchestrationSession(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  sessionId: string,
  agentGatewayClient?: AgentGatewayClient,
) {
  const session = getSessionRow(sqlite, sessionId);

  if (session.status === 'COMPLETED') {
    throwInvalidState(`Session ${sessionId} is already completed`);
  }

  sqlite.transaction(() => {
    sqlite
      .prepare(
        `
          UPDATE orchestration_steps
          SET
            status = 'PENDING',
            updated_at = @updatedAt
          WHERE session_id = @sessionId
            AND status IN ('PENDING', 'READY', 'RUNNING', 'WAITING_RETRY', 'CANCELLED')
        `,
      )
      .run({
        sessionId,
        updatedAt: new Date().toISOString(),
      });

    writeSessionStatus(sqlite, sessionId, 'RUNNING');
  })();

  appendEvent(sqlite, broker, {
    sessionId,
    type: 'session.resumed',
    payload: {
      reason: 'user-request',
    },
  });

  launchSessionSchedule(sqlite, broker, sessionId, agentGatewayClient);

  return {
    session: await getOrchestrationSessionById(sqlite, sessionId),
  };
}

export async function retryOrchestrationSession(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  sessionId: string,
  agentGatewayClient?: AgentGatewayClient,
) {
  getSessionRow(sqlite, sessionId);

  const failedSteps = listSessionStepRows(sqlite, sessionId).filter(
    (step) => isRetryableStepStatus(step.status),
  );

  if (failedSteps.length === 0) {
    throwInvalidState(`Session ${sessionId} has no failed steps to retry`);
  }

  const transaction = sqlite.transaction(() => {
    writeSessionStatus(sqlite, sessionId, 'RUNNING');

    const statement = sqlite.prepare(
      `SELECT 1`,
    );

    for (const step of failedSteps) {
      statement.get();
      if (step.attempt >= step.max_attempts) {
        throwInvalidState(`Step ${step.id} exhausted max attempts (${step.max_attempts})`);
      }
      resetStepForRetry(sqlite, step.id, 'READY', step.attempt + 1);
    }
  });

  transaction();

  appendEvent(sqlite, broker, {
    sessionId,
    type: 'session.retried',
    payload: {
      stepIds: failedSteps.map((step) => step.id),
    },
  });

  for (const step of failedSteps) {
    appendEvent(sqlite, broker, {
      sessionId,
      stepId: step.id,
      type: 'step.retried',
      payload: {
        attempt: step.attempt + 1,
        previousStatus: step.status,
      },
    });
  }

  launchSessionSchedule(sqlite, broker, sessionId, agentGatewayClient);

  return {
    session: await getOrchestrationSessionById(sqlite, sessionId),
  };
}

export async function retryOrchestrationStep(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  stepId: string,
  agentGatewayClient?: AgentGatewayClient,
) {
  const step = getStepRow(sqlite, stepId);

  if (!isRetryableStepStatus(step.status)) {
    throwInvalidState(`Step ${stepId} is not retryable from status ${step.status}`);
  }

  if (step.attempt >= step.max_attempts) {
    throwInvalidState(`Step ${stepId} exhausted max attempts (${step.max_attempts})`);
  }

  resetStepForRetry(sqlite, stepId, 'READY', step.attempt + 1);
  writeSessionStatus(sqlite, step.session_id, 'RUNNING');

  appendEvent(sqlite, broker, {
    sessionId: step.session_id,
    stepId,
    type: 'step.retried',
    payload: {
      attempt: step.attempt + 1,
    },
  });

  launchSessionSchedule(
    sqlite,
    broker,
    step.session_id,
    agentGatewayClient,
  );

  return {
    step: await getOrchestrationStepById(sqlite, stepId),
  };
}

export async function recoverActiveOrchestrationSessions(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  agentGatewayClient?: AgentGatewayClient,
) {
  const rows = sqlite
    .prepare(
      `
        SELECT id
        FROM orchestration_sessions
        WHERE status IN (${getRecoverableSessionStatuses()
          .map((status) => `'${status}'`)
          .join(', ')})
      `,
    )
    .all() as Array<{ id: string }>;

  if (!agentGatewayClient?.isConfigured()) {
    return;
  }

  for (const row of rows) {
    appendEvent(sqlite, broker, {
      sessionId: row.id,
      type: 'session.resumed',
      payload: {
        reason: 'process-recovery',
      },
    });

    const steps = listSessionStepRows(sqlite, row.id);
    const runningStep = steps.find((step) => step.status === 'RUNNING');

    if (runningStep?.runtime_session_id) {
      const session = await getOrchestrationSessionById(sqlite, row.id);
      const step = await getOrchestrationStepById(sqlite, runningStep.id);
      const upstreamArtifacts = await listArtifactsBySession(sqlite, row.id);

      try {
        const result = await resumeOrchestrationStepViaGateway({
          agentGatewayClient,
          session,
          step,
          upstreamArtifacts,
          runtimeSessionId: runningStep.runtime_session_id,
          runtimeCursor: runningStep.runtime_cursor,
          onGatewayEvent: (event) => {
            writeStepExecutionData(sqlite, runningStep.id, {
              runtimeCursor: event.cursor ?? null,
            });
            appendEvent(sqlite, broker, {
              sessionId: row.id,
              stepId: runningStep.id,
              type: 'step.runtime.event',
              payload: buildGatewayEventPayload({
                cursor: event.cursor ?? null,
                data: event.data ?? {},
                error: event.error ?? null,
                eventId: event.eventId ?? null,
                emittedAt: event.emittedAt ?? null,
                sessionId: event.sessionId ?? null,
                traceId: event.traceId ?? null,
                type: event.type,
                recovery: true,
              }),
            });
          },
        });

        await applyExecutionResult(sqlite, broker, row.id, runningStep, result);
      } catch (error) {
        if (error instanceof ProblemError && error.status === 404) {
          markStepWaitingRetry(sqlite, broker, row.id, runningStep, {
            errorCode: 'ORCHESTRATION_RUNTIME_MISSING',
            errorMessage: `Runtime session ${runningStep.runtime_session_id} is no longer available`,
            reason: 'runtime-missing-after-recovery',
          });
        } else {
          markStepWaitingRetry(sqlite, broker, row.id, runningStep, {
            errorCode: 'ORCHESTRATION_RECOVERY_FAILED',
            errorMessage:
              error instanceof Error
                ? error.message
                : 'Failed to recover runtime session',
            reason: 'recovery-failed',
          });
        }
      }
    } else if (runningStep) {
      markStepWaitingRetry(sqlite, broker, row.id, runningStep, {
        errorCode: 'ORCHESTRATION_RUNTIME_MISSING',
        errorMessage: `Running step ${runningStep.id} has no runtime session id during recovery`,
        reason: 'runtime-metadata-missing',
      });
    } else {
      sqlite
        .prepare(
          `
            UPDATE orchestration_steps
            SET
              status = 'PENDING',
              updated_at = @updatedAt
            WHERE session_id = @sessionId
              AND status IN ('PENDING', 'READY')
          `,
        )
        .run({
          sessionId: row.id,
          updatedAt: new Date().toISOString(),
        });
    }

    if (!finalizeSessionIfComplete(sqlite, broker, row.id)) {
      writeSessionStatus(sqlite, row.id, 'RUNNING');
      launchSessionSchedule(sqlite, broker, row.id, agentGatewayClient);
    }
  }
}
