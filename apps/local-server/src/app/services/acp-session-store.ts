import type { Database } from 'better-sqlite3';
import { ProblemError } from '@orchestration/runtime-acp';
import type {
  AcpEventEnvelopePayload,
  AcpEventErrorPayload,
  AcpEventUpdatePayload,
  AcpRuntimeSessionPayload,
  AcpSessionPayload,
  AcpSessionState,
  AcpSessionStatus,
  AcpSupervisionPolicyPayload,
  AcpTimeoutScopePayload,
  ManagedAcpSessionSnapshot,
} from '@orchestration/runtime-acp';

export interface AcpSessionRow {
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

export interface AcpEventRow {
  emitted_at: string;
  error_json: string | null;
  event_id: string;
  payload_json: string;
  session_id: string;
  type: string;
}

export interface UpdateSessionRuntimeInput {
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

export function cloneDefaultSupervisionPolicy(): AcpSupervisionPolicyPayload {
  return {
    ...DEFAULT_ACP_SESSION_SUPERVISION_POLICY,
  };
}

export function parseSupervisionPolicy(
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

export function resolveSupervisionPolicy(
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

export function calculateIsoDeadline(
  startedAt: string | null,
  durationMs: number,
): string | null {
  const baseline = startedAt ? Date.parse(startedAt) : Number.NaN;
  const startedAtMs = Number.isNaN(baseline) ? Date.now() : baseline;
  return new Date(startedAtMs + durationMs).toISOString();
}

export function calculateActivityDeadline(
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

export function mapSessionRow(row: AcpSessionRow): AcpSessionPayload {
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
    state: row.state,
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

export function mapEventRow(row: AcpEventRow): AcpEventEnvelopePayload {
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

export function getSessionRow(
  sqlite: Database,
  sessionId: string,
): AcpSessionRow {
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

export function updateSessionRuntime(
  sqlite: Database,
  sessionId: string,
  update: UpdateSessionRuntimeInput,
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

export function listSupervisedSessions(sqlite: Database): AcpSessionRow[] {
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

export function mapRuntimeSessionSnapshot(
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
