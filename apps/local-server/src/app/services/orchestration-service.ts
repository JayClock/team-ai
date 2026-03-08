import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
import type { OrchestrationStreamBroker } from '../plugins/orchestration-stream';
import type {
  OrchestrationEventPayload,
  OrchestrationSessionListPayload,
  OrchestrationSessionPayload,
  OrchestrationStepPayload,
  SessionStatus,
  StepKind,
  StepStatus,
} from '../schemas/orchestration';
import { getProjectById } from './project-service';

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
  goal: string;
  id: string;
  project_id: string;
  status: SessionStatus;
  strategy_json: string;
  title: string;
  updated_at: string;
}

interface StepRow {
  attempt: number;
  created_at: string;
  depends_on_json: string;
  id: string;
  kind: StepKind;
  max_attempts: number;
  session_id: string;
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
  goal: string;
  projectId: string;
  title: string;
}

const sessionRunners = new Map<string, SessionRunner>();

function launchSessionSchedule(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  sessionId: string,
) {
  void scheduleOrchestrationSession(sqlite, broker, sessionId).catch((error) => {
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

function mapStepRow(row: StepRow): OrchestrationStepPayload {
  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    dependsOn: JSON.parse(row.depends_on_json) as string[],
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

function mapSessionRow(
  sqlite: Database,
  row: SessionRow,
): OrchestrationSessionPayload {
  return {
    id: row.id,
    projectId: row.project_id,
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

function hasFailedBefore(sqlite: Database, stepId: string): boolean {
  const row = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM orchestration_events
        WHERE step_id = ? AND type = 'step.failed'
      `,
    )
    .get(stepId) as { count: number };

  return row.count > 0;
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
  const hasPending = steps.some(
    (step) => step.status === 'PENDING' || step.status === 'READY',
  );

  if (hasFailed) {
    writeSessionStatus(sqlite, sessionId, 'FAILED');
    appendEvent(sqlite, broker, {
      sessionId,
      type: 'session.failed',
      payload: {
        reason: 'step-failed',
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

async function executeStep(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  runner: SessionRunner,
  sessionId: string,
  step: StepRow,
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
    },
  });

  await sleep(stepExecutionDelayMs);

  if (runner.cancelled) {
    return;
  }

  const session = getSessionRow(sqlite, sessionId);
  const shouldFailOnce =
    step.kind === 'IMPLEMENT' &&
    session.goal.includes('[fail-once]') &&
    !hasFailedBefore(sqlite, step.id);

  if (shouldFailOnce) {
    writeStepStatus(sqlite, step.id, 'FAILED');
    appendEvent(sqlite, broker, {
      sessionId,
      stepId: step.id,
      type: 'step.failed',
      payload: {
        attempt: step.attempt,
        reason: 'synthetic-failure',
      },
    });
    writeSessionStatus(sqlite, sessionId, 'FAILED');
    appendEvent(sqlite, broker, {
      sessionId,
      type: 'session.failed',
      payload: {
        stepId: step.id,
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
      kind: step.kind,
    },
  });
}

export async function scheduleOrchestrationSession(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  sessionId: string,
) {
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

      await executeStep(sqlite, broker, runner, sessionId, nextStep);

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
) {
  await getProjectById(sqlite, input.projectId);

  const now = new Date().toISOString();
  const sessionId = createSessionId();
  const strategy = {
    failFast: true,
    maxParallelism: 1,
    mode: 'planner-assisted',
  };
  const stepDefinitions: Array<{
    dependsOn: string[];
    id: string;
    kind: StepKind;
    title: string;
  }> = [
    {
      id: createStepId(),
      title: 'Analyze request',
      kind: 'PLAN',
      dependsOn: [],
    },
    {
      id: createStepId(),
      title: 'Implement local changes',
      kind: 'IMPLEMENT',
      dependsOn: [],
    },
    {
      id: createStepId(),
      title: 'Verify result',
      kind: 'VERIFY',
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
          status,
          attempt,
          max_attempts,
          depends_on_json,
          order_index,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          @sessionId,
          @title,
          @kind,
          @status,
          @attempt,
          @maxAttempts,
          @dependsOnJson,
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
        status: 'PENDING',
        attempt: 1,
        maxAttempts: 3,
        dependsOnJson: JSON.stringify(step.dependsOn),
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
    },
  });

  const session = await getOrchestrationSessionById(sqlite, sessionId);
  launchSessionSchedule(sqlite, broker, sessionId);

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
  return listSessionStepRows(sqlite, sessionId).map(mapStepRow);
}

export async function getOrchestrationStepById(sqlite: Database, stepId: string) {
  return mapStepRow(getStepRow(sqlite, stepId));
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
) {
  const session = getSessionRow(sqlite, sessionId);

  if (session.status === 'COMPLETED') {
    throwInvalidState(`Session ${sessionId} is already completed`);
  }

  const runner = sessionRunners.get(sessionId);

  if (runner) {
    runner.cancelled = true;
  }

  writeSessionStatus(sqlite, sessionId, 'CANCELLED');
  appendEvent(sqlite, broker, {
    sessionId,
    type: 'session.cancelled',
    payload: {},
  });

  return {
    session: await getOrchestrationSessionById(sqlite, sessionId),
  };
}

export async function resumeOrchestrationSession(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  sessionId: string,
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
            AND status IN ('PENDING', 'READY', 'RUNNING', 'WAITING_RETRY')
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

  launchSessionSchedule(sqlite, broker, sessionId);

  return {
    session: await getOrchestrationSessionById(sqlite, sessionId),
  };
}

export async function retryOrchestrationSession(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  sessionId: string,
) {
  getSessionRow(sqlite, sessionId);

  const failedSteps = listSessionStepRows(sqlite, sessionId).filter(
    (step) => step.status === 'FAILED',
  );

  if (failedSteps.length === 0) {
    throwInvalidState(`Session ${sessionId} has no failed steps to retry`);
  }

  const transaction = sqlite.transaction(() => {
    writeSessionStatus(sqlite, sessionId, 'RUNNING');

    const statement = sqlite.prepare(
      `
        UPDATE orchestration_steps
        SET
          status = 'READY',
          attempt = attempt + 1,
          updated_at = @updatedAt
        WHERE id = @id
      `,
    );

    for (const step of failedSteps) {
      statement.run({
        id: step.id,
        updatedAt: new Date().toISOString(),
      });
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

  launchSessionSchedule(sqlite, broker, sessionId);

  return {
    session: await getOrchestrationSessionById(sqlite, sessionId),
  };
}

export async function retryOrchestrationStep(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
  stepId: string,
) {
  const step = getStepRow(sqlite, stepId);

  if (step.status !== 'FAILED') {
    throwInvalidState(`Step ${stepId} is not retryable from status ${step.status}`);
  }

  writeStepStatus(sqlite, stepId, 'READY', {
    incrementAttempt: true,
  });
  writeSessionStatus(sqlite, step.session_id, 'RUNNING');

  appendEvent(sqlite, broker, {
    sessionId: step.session_id,
    stepId,
    type: 'step.retried',
    payload: {
      attempt: step.attempt + 1,
    },
  });

  launchSessionSchedule(sqlite, broker, step.session_id);

  return {
    step: await getOrchestrationStepById(sqlite, stepId),
  };
}

export async function recoverActiveOrchestrationSessions(
  sqlite: Database,
  broker: OrchestrationStreamBroker,
) {
  const rows = sqlite
    .prepare(
      `
        SELECT id
        FROM orchestration_sessions
        WHERE status IN ('PENDING', 'PLANNING', 'RUNNING')
      `,
    )
    .all() as Array<{ id: string }>;

  for (const row of rows) {
    sqlite.transaction(() => {
      sqlite
        .prepare(
          `
            UPDATE orchestration_steps
            SET
              status = 'PENDING',
              updated_at = @updatedAt
            WHERE session_id = @sessionId
              AND status IN ('PENDING', 'READY', 'RUNNING', 'WAITING_RETRY')
          `,
        )
        .run({
          sessionId: row.id,
          updatedAt: new Date().toISOString(),
        });

      writeSessionStatus(sqlite, row.id, 'RUNNING');
    })();

    appendEvent(sqlite, broker, {
      sessionId: row.id,
      type: 'session.resumed',
      payload: {
        reason: 'process-recovery',
      },
    });

    launchSessionSchedule(sqlite, broker, row.id);
  }
}
