import type { Database } from 'better-sqlite3';
import { ProblemError } from '@orchestration/runtime-acp';
import type {
  AcpLifecycleStatePayload,
  AcpRuntimeClient,
  AcpStreamBroker,
  AcpSupervisionPolicyPayload,
  AcpTimeoutScopePayload,
  DiagnosticLogger,
} from '@orchestration/runtime-acp';
import {
  appendLifecycleEvent,
  appendSupervisionEvent,
} from './acp-session-events';
import {
  getSessionRow,
  listSupervisedSessions,
  parseSupervisionPolicy,
  type AcpSessionRow,
  updateSessionRuntime,
} from './acp-session-store';

interface AcpSessionSupervisionCallbacks {
  ensureRuntimeLoaded: (
    sqlite: Database,
    broker: AcpStreamBroker,
    runtime: AcpRuntimeClient,
    sessionId: string,
    options?: AcpSessionSupervisionOptions,
  ) => Promise<string>;
  syncTaskExecutionOutcome: (
    sqlite: Database,
    sessionId: string,
    state: 'COMPLETED' | 'FAILED' | 'CANCELLED',
    fallbackFailureReason?: string | null,
    options?: AcpSessionSupervisionOptions,
    taskStatusOverride?: string,
  ) => Promise<void>;
}

export interface AcpSessionSupervisionOptions {
  logger?: DiagnosticLogger;
  now?: Date;
  source?: string;
}

export function resolveLifecycleFailureState(error: unknown): Extract<
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

export function resolveTimeoutLifecycleState(
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

export async function requestSessionSupervisionCancellation(
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
  callbacks: AcpSessionSupervisionCallbacks,
  options: AcpSessionSupervisionOptions = {},
) {
  options.logger?.info?.(
    {
      detail: input.detail,
      model: session.model,
      provider: session.provider,
      scope: input.scope,
      sessionId: session.id,
      source: options.source ?? 'acp-service',
      stage: 'timeout_detected',
      taskBound: session.task_id !== null,
    },
    'ACP session supervision transition',
  );
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

  let cancelSent = false;
  if (session.runtime_session_id && !runtime.isSessionActive(session.id)) {
    await callbacks.ensureRuntimeLoaded(
      sqlite,
      broker,
      runtime,
      session.id,
      options,
    );
  }

  if (session.runtime_session_id !== null || runtime.isSessionActive(session.id)) {
    await runtime.cancelSession({
      localSessionId: session.id,
      reason: input.detail,
    });
    cancelSent = true;
  }

  options.logger?.info?.(
    {
      cancelSent,
      cancelRequestedAt: input.nowIso,
      model: session.model,
      provider: session.provider,
      scope: input.scope,
      sessionId: session.id,
      source: options.source ?? 'acp-service',
      stage: 'cancel_requested',
      taskBound: session.task_id !== null,
    },
    'ACP session supervision transition',
  );
}

export async function enforceStepBudgetIfNeeded(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  sessionId: string,
  callbacks: AcpSessionSupervisionCallbacks,
  options: AcpSessionSupervisionOptions = {},
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
    callbacks,
    options,
  );
}

export async function runAcpSessionSupervisionTick(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  callbacks: AcpSessionSupervisionCallbacks,
  options: AcpSessionSupervisionOptions = {},
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
          callbacks,
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
      const cancelElapsedMs = Number.isNaN(cancelRequestedAtMs)
        ? null
        : nowMs - cancelRequestedAtMs;

      forcedSessionIds.push(session.id);
      options.logger?.warn?.(
        {
          cancelElapsedMs,
          cancelRequestedAt: session.cancel_requested_at,
          model: session.model,
          provider: session.provider,
          scope: timeoutScope,
          sessionId: session.id,
          source: options.source ?? 'acp-service',
          stage: 'cancel_grace_expired',
          taskBound: session.task_id !== null,
        },
        'ACP session supervision transition',
      );
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
      options.logger?.warn?.(
        {
          cancelElapsedMs,
          completedAt: nowIso,
          forceKilled: true,
          model: session.model,
          provider: session.provider,
          scope: timeoutScope,
          sessionId: session.id,
          source: options.source ?? 'acp-service',
          stage: 'force_killed',
          taskBound: session.task_id !== null,
        },
        'ACP session supervision transition',
      );
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

      await callbacks.syncTaskExecutionOutcome(
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
