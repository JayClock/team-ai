import { Entity, State } from '@hateoas-ts/resource';
import { useClient } from '@hateoas-ts/resource-react';
import {
  AcpEventEnvelope,
  AcpSession,
  AcpSessionSummary,
  type AgentRole,
  Project,
} from '@shared/schema';
import { useCallback, useMemo, useRef, useState } from 'react';

const ACP_JSON_RPC_VERSION = '2.0';
const ACP_ENDPOINT = '/api/acp';

type JsonRpcErrorMeta = {
  acpCode: string;
  httpStatus: number;
  retryable: boolean;
};

type JsonRpcError = {
  code: number;
  message: string;
  meta?: JsonRpcErrorMeta;
};

type JsonRpcEnvelope<TResult> = Entity<{
  jsonrpc: string;
  id: string | number | null;
  result: TResult | null;
  error: JsonRpcError | null;
}>;

type SessionPayload = {
  id: string;
  state: string;
};

type SessionRpcResult = {
  session?: SessionPayload;
};

type PromptRpcResult = SessionRpcResult & {
  runtime?: {
    output?: string;
    completedAt?: string;
  };
};

type AcpSessionRef = State<AcpSessionSummary> | State<AcpSession>;
type AcpSessionRole = Exclude<AgentRole, 'SPECIALIST'>;

export type AcpSessionRpcFailure = JsonRpcError;

export type CreateAcpSessionInput = {
  actorUserId?: string;
  provider?: string;
  mode?: string;
  role?: AcpSessionRole;
  parentSessionId?: string;
  idempotencyKey?: string;
  goal?: string;
  traceId?: string;
};

export type SelectAcpSessionInput = {
  session: string | AcpSessionRef;
  load?: boolean;
  historyLimit?: number;
  traceId?: string;
};

export type PromptAcpSessionInput = {
  prompt: string;
  session?: string | AcpSessionRef;
  timeoutMs?: number;
  eventId?: string;
  traceId?: string;
};

export type CancelAcpSessionInput = {
  session?: string | AcpSessionRef;
  reason?: string;
  traceId?: string;
};

export type ReplayAcpSessionHistoryInput = {
  session?: State<AcpSession>;
  sinceEventId?: string;
  limit?: number;
  merge?: boolean;
};

export type RenameAcpSessionInput = {
  name: string;
  session?: string | AcpSessionRef;
};

export type DeleteAcpSessionInput = {
  session?: string | AcpSessionRef;
};

export type UseAcpSessionOptions = {
  actorUserId?: string;
  provider?: string;
  mode?: string;
  role?: AcpSessionRole;
  historyLimit?: number;
  traceId?: string;
};

function mergeHistory(
  current: AcpEventEnvelope[],
  incoming: AcpEventEnvelope[],
): AcpEventEnvelope[] {
  const merged = new Map(current.map((event) => [event.eventId, event]));
  for (const event of incoming) {
    merged.set(event.eventId, event);
  }
  return Array.from(merged.values());
}

export function useAcpSession(
  projectState: State<Project>,
  options: UseAcpSessionOptions = {},
) {
  const client = useClient();
  const requestCounterRef = useRef(1);
  const [selectedSession, setSelectedSession] = useState<State<AcpSession> | null>(
    null,
  );
  const [history, setHistory] = useState<AcpEventEnvelope[]>([]);
  const [lastError, setLastError] = useState<AcpSessionRpcFailure | null>(null);

  const sessionsResource = useMemo(
    () => projectState.follow('acp-sessions'),
    [projectState],
  );

  const rpc = useCallback(
    async <TResult,>(
      method: string,
      params: Record<string, unknown>,
      traceId?: string,
    ): Promise<TResult> => {
      const id = `web-${requestCounterRef.current++}`;
      const responseState = await client.go<JsonRpcEnvelope<TResult>>(ACP_ENDPOINT).post({
        data: {
          jsonrpc: ACP_JSON_RPC_VERSION,
          method,
          params,
          id,
        },
        headers:
          traceId && traceId.trim()
            ? {
                'X-Trace-Id': traceId.trim(),
              }
            : undefined,
      });

      const envelope = responseState.data;
      if (envelope.error) {
        setLastError(envelope.error);
        throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
      }
      if (envelope.result == null) {
        throw new Error(`ACP rpc "${method}" returned empty result`);
      }
      setLastError(null);
      return envelope.result;
    },
    [client],
  );

  const findSessionInCollection = useCallback(
    async (sessionId: string): Promise<State<AcpSessionSummary>> => {
      let cursor = await sessionsResource.refresh();
      while (true) {
        const found = cursor.collection.find(
          (sessionState) => sessionState.data.id === sessionId,
        );
        if (found) {
          return found;
        }
        if (!cursor.hasLink('next')) {
          throw new Error(`Session ${sessionId} is not discoverable from sessions collection`);
        }
        cursor = await cursor.follow('next').get();
      }
    },
    [sessionsResource],
  );

  const resolveSession = useCallback(
    async (session: string | AcpSessionRef): Promise<State<AcpSession>> => {
      if (typeof session === 'string') {
        const summary = await findSessionInCollection(session);
        return summary.follow('self').get();
      }
      const withSelfLink = session as State<AcpSessionSummary>;
      return withSelfLink.follow('self').get();
    },
    [findSessionInCollection],
  );

  const replayHistory = useCallback(
    async (input: ReplayAcpSessionHistoryInput = {}): Promise<AcpEventEnvelope[]> => {
      const target = input.session ?? selectedSession;
      if (!target) {
        throw new Error('Cannot replay history without a selected session');
      }
      const query: Record<string, string | number> = {};
      if (input.sinceEventId) {
        query.since = input.sinceEventId;
      }
      query.limit = input.limit ?? options.historyLimit ?? 200;
      const historyState = await target.follow('history', query).get();
      const entries = historyState.data.history ?? [];
      if (input.merge ?? true) {
        setHistory((current) => mergeHistory(current, entries));
      } else {
        setHistory(entries);
      }
      return entries;
    },
    [options.historyLimit, selectedSession],
  );

  const ingestEvents = useCallback((events: AcpEventEnvelope[]) => {
    if (events.length === 0) {
      return;
    }
    setHistory((current) => mergeHistory(current, events));
  }, []);

  const select = useCallback(
    async (input: SelectAcpSessionInput): Promise<State<AcpSession>> => {
      const sessionId =
        typeof input.session === 'string' ? input.session : input.session.data.id;
      if (input.load ?? true) {
        await rpc<SessionRpcResult>(
          'session/load',
          {
            projectId: projectState.data.id,
            sessionId,
          },
          input.traceId ?? options.traceId,
        );
      }
      const fullSession = await resolveSession(input.session);
      setSelectedSession(fullSession);
      await replayHistory({
        session: fullSession,
        limit: input.historyLimit ?? options.historyLimit,
        merge: false,
      });
      return fullSession;
    },
    [options.historyLimit, options.traceId, projectState.data.id, replayHistory, resolveSession, rpc],
  );

  const create = useCallback(
    async (input: CreateAcpSessionInput = {}): Promise<State<AcpSession>> => {
      const actorUserId = input.actorUserId ?? options.actorUserId;
      if (!actorUserId) {
        throw new Error('actorUserId is required when creating ACP session');
      }
      const result = await rpc<SessionRpcResult>(
        'session/new',
        {
          projectId: projectState.data.id,
          actorUserId,
          provider: input.provider ?? options.provider ?? 'codex',
          mode: input.mode ?? options.mode ?? 'CHAT',
          role: input.role ?? options.role,
          parentSessionId: input.parentSessionId,
          idempotencyKey: input.idempotencyKey,
          goal: input.goal,
        },
        input.traceId ?? options.traceId,
      );
      const sessionId = result.session?.id;
      if (!sessionId) {
        throw new Error('session/new did not return a session id');
      }
      return select({ session: sessionId, load: false });
    },
    [
      options.actorUserId,
      options.mode,
      options.provider,
      options.traceId,
      projectState.data.id,
      rpc,
      select,
    ],
  );

  const prompt = useCallback(
    async (input: PromptAcpSessionInput): Promise<PromptRpcResult> => {
      if (!input.prompt.trim()) {
        throw new Error('prompt must not be blank');
      }
      const base =
        input.session !== undefined
          ? await resolveSession(input.session)
          : selectedSession;
      if (!base) {
        throw new Error('Cannot prompt without a selected session');
      }
      const sinceEventId = base.data.lastEventId?.id;
      const result = await rpc<PromptRpcResult>(
        'session/prompt',
        {
          projectId: projectState.data.id,
          sessionId: base.data.id,
          prompt: input.prompt,
          timeoutMs: input.timeoutMs,
          eventId: input.eventId ?? `ui-${Date.now()}`,
        },
        input.traceId ?? options.traceId,
      );
      const refreshed = await base.follow('self').get();
      setSelectedSession(refreshed);
      await replayHistory({
        session: refreshed,
        sinceEventId,
        merge: true,
      });
      return result;
    },
    [
      options.traceId,
      projectState.data.id,
      replayHistory,
      resolveSession,
      rpc,
      selectedSession,
    ],
  );

  const cancel = useCallback(
    async (input: CancelAcpSessionInput = {}): Promise<SessionRpcResult> => {
      const base =
        input.session !== undefined
          ? await resolveSession(input.session)
          : selectedSession;
      if (!base) {
        throw new Error('Cannot cancel without a selected session');
      }
      const sinceEventId = base.data.lastEventId?.id;
      const result = await rpc<SessionRpcResult>(
        'session/cancel',
        {
          projectId: projectState.data.id,
          sessionId: base.data.id,
          reason: input.reason,
        },
        input.traceId ?? options.traceId,
      );
      const refreshed = await base.follow('self').get();
      setSelectedSession(refreshed);
      await replayHistory({
        session: refreshed,
        sinceEventId,
        merge: true,
      });
      return result;
    },
    [
      options.traceId,
      projectState.data.id,
      replayHistory,
      resolveSession,
      rpc,
      selectedSession,
    ],
  );

  const rename = useCallback(
    async (input: RenameAcpSessionInput): Promise<State<AcpSession>> => {
      const name = input.name.trim();
      if (!name) {
        throw new Error('name must not be blank');
      }
      const base =
        input.session !== undefined
          ? await resolveSession(input.session)
          : selectedSession;
      if (!base) {
        throw new Error('Cannot rename without a selected session');
      }
      const self = base.follow('self');
      await self.patch({
        data: { name },
      });
      const refreshed = await self.refresh();
      setSelectedSession(refreshed);
      await replayHistory({
        session: refreshed,
        merge: false,
      });
      return refreshed;
    },
    [replayHistory, resolveSession, selectedSession],
  );

  const deleteSession = useCallback(
    async (input: DeleteAcpSessionInput = {}): Promise<string> => {
      const base =
        input.session !== undefined
          ? await resolveSession(input.session)
          : selectedSession;
      if (!base) {
        throw new Error('Cannot delete without a selected session');
      }
      await base.follow('self').delete();
      const deletedId = base.data.id;
      setSelectedSession((current) =>
        current?.data.id === deletedId ? null : current,
      );
      setHistory((current) =>
        current.filter((event) => event.sessionId !== deletedId),
      );
      return deletedId;
    },
    [resolveSession, selectedSession],
  );

  const clearSelection = useCallback(() => {
    setSelectedSession(null);
    setHistory([]);
  }, []);

  return {
    sessionsResource,
    selectedSession,
    history,
    lastError,
    clearSelection,
    ingestEvents,
    create,
    select,
    prompt,
    cancel,
    rename,
    deleteSession,
    replayHistory,
  };
}
