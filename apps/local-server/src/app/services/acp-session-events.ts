import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import {
  extractSessionMetadataFromNormalizedUpdate,
  resolveSessionStateFromNormalizedUpdate,
} from '@orchestration/runtime-acp';
import type {
  AcpEventEnvelopePayload,
  AcpEventErrorPayload,
  AcpEventUpdatePayload,
  AcpLifecycleStatePayload,
  AcpRuntimeClient,
  AcpRuntimeSessionHooks,
  AcpStreamBroker,
  AcpSupervisionPolicyPayload,
  AcpTimeoutScopePayload,
  DiagnosticLogger,
  NormalizedSessionUpdate,
} from '@orchestration/runtime-acp';
import {
  getAcpSessionEventWriteBuffer,
} from './acp-session-event-write-buffer';
import {
  getSessionRow,
  updateSessionRuntime,
} from './acp-session-store';
import { recordAcpTrace } from './trace-service';

const eventIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  16,
);

interface AcpSessionEventOptions {
  logger?: DiagnosticLogger;
  source?: string;
}

interface AcpSessionEventCallbacks {
  enforceStepBudgetIfNeeded: (
    sqlite: Database,
    broker: AcpStreamBroker,
    runtime: AcpRuntimeClient,
    sessionId: string,
    options?: AcpSessionEventOptions,
  ) => Promise<void>;
  syncTaskExecutionOutcome: (
    sqlite: Database,
    sessionId: string,
    state: 'COMPLETED' | 'FAILED' | 'CANCELLED',
    fallbackFailureReason?: string | null,
    options?: AcpSessionEventOptions,
    taskStatusOverride?: string,
  ) => Promise<void>;
}

function createEventId() {
  return `acpe_${eventIdGenerator()}`;
}

export function createCanonicalUpdate(
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

export function appendLocalEvent(
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

export function appendPromptRequestedEvents(
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

export function appendLifecycleEvent(
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

export function appendSupervisionEvent(
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

export function resolveStepCountIncrement(
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

export function createRuntimeHooks(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  localSessionId: string,
  callbacks: AcpSessionEventCallbacks,
  options: AcpSessionEventOptions = {},
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
      await callbacks.enforceStepBudgetIfNeeded(
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

      await callbacks.syncTaskExecutionOutcome(
        sqlite,
        localSessionId,
        'FAILED',
        error.message,
        options,
      );
    },
  };
}
