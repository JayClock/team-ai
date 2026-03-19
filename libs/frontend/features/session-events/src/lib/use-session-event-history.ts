import { State } from '@hateoas-ts/resource';
import { AcpEventEnvelope, AcpSession } from '@shared/schema';
import {
  getCurrentDesktopRuntimeConfig,
  resolveRuntimeApiUrl,
} from '@shared/util-http';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STREAM_RETRY_DELAY_MS = 1500;

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function mergeHistory(
  current: AcpEventEnvelope[],
  incoming: AcpEventEnvelope[],
): AcpEventEnvelope[] {
  const merged = new Map(current.map((event) => [event.eventId, event]));
  for (const event of incoming) {
    merged.set(event.eventId, event);
  }

  return Array.from(merged.values()).sort((left, right) => {
    const emittedDelta =
      parseTimestamp(left.emittedAt) - parseTimestamp(right.emittedAt);
    if (emittedDelta !== 0) {
      return emittedDelta;
    }
    return left.eventId.localeCompare(right.eventId);
  });
}

export function useSessionEventHistory(options: {
  historyLimit: number;
  session: State<AcpSession> | null;
}) {
  const { historyLimit, session } = options;
  const [events, setEvents] = useState<AcpEventEnvelope[]>([]);
  const [loading, setLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const allowReconnectRef = useRef(true);
  const latestEventIdRef = useRef<string | undefined>(undefined);
  const sessionId = session?.data.id;
  const sessionLastEventId = session?.data.lastEventId?.id;

  const stopStream = useCallback((manual: boolean) => {
    allowReconnectRef.current = !manual;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    latestEventIdRef.current =
      events[events.length - 1]?.eventId ?? sessionLastEventId ?? undefined;
  }, [events, sessionLastEventId]);

  useEffect(() => {
    let active = true;

    stopStream(true);
    if (!session) {
      setEvents([]);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setEvents([]);

    void session
      .follow('history', { limit: historyLimit })
      .get()
      .then((historyState) => {
        if (!active) {
          return;
        }
        setEvents(historyState.data.history ?? []);
      })
      .catch(() => {
        if (active) {
          setEvents([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      stopStream(true);
    };
  }, [historyLimit, session, stopStream]);

  const startStream = useCallback(() => {
    if (!sessionId) {
      return;
    }

    stopStream(false);
    allowReconnectRef.current = true;

    const url = new URL(resolveRuntimeApiUrl('/api/acp'));
    url.searchParams.set('sessionId', sessionId);

    const desktopRuntimeConfig = getCurrentDesktopRuntimeConfig();
    if (desktopRuntimeConfig) {
      url.searchParams.set(
        'desktopSessionToken',
        desktopRuntimeConfig.desktopSessionToken,
      );
    }

    const latest = latestEventIdRef.current ?? sessionLastEventId ?? undefined;
    if (latest) {
      url.searchParams.set('since', latest);
    }

    const source = new EventSource(url.toString(), { withCredentials: true });
    const onEvent = (raw: string) => {
      try {
        const parsed = JSON.parse(raw) as AcpEventEnvelope;
        if (parsed.sessionId !== sessionId) {
          return;
        }
        setEvents((current) => mergeHistory(current, [parsed]));
      } catch {
        // ignore non-json payloads
      }
    };

    source.addEventListener('acp-event', (event) => {
      onEvent((event as MessageEvent).data);
    });
    source.onmessage = (event) => {
      onEvent(event.data);
    };
    source.onerror = () => {
      source.close();
      eventSourceRef.current = null;
      if (!allowReconnectRef.current) {
        return;
      }
      reconnectTimerRef.current = window.setTimeout(() => {
        startStream();
      }, STREAM_RETRY_DELAY_MS);
    };
    eventSourceRef.current = source;
  }, [sessionId, sessionLastEventId, stopStream]);

  useEffect(() => {
    if (!sessionId) {
      stopStream(true);
      return;
    }

    startStream();
    return () => stopStream(true);
  }, [sessionId, startStream, stopStream]);

  return useMemo(
    () => ({
      events,
      loading,
    }),
    [events, loading],
  );
}
