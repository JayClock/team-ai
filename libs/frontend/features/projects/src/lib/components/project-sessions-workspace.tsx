import { State } from '@hateoas-ts/resource';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { useAcpSession } from '@features/project-conversations';
import {
  AcpEventEnvelope,
  AcpSessionSummary,
  Project,
  Root,
} from '@shared/schema';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  ScrollArea,
  Textarea,
  toast,
} from '@shared/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STREAM_RETRY_DELAY_MS = 1500;

type StreamStatus = 'idle' | 'connecting' | 'connected' | 'error';

function sessionDisplayName(session: State<AcpSessionSummary>): string {
  const name = session.data.name?.trim();
  if (name) {
    return name;
  }
  return `Session ${session.data.id}`;
}

function timestamp(value: string | null): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'n/a';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function eventSummary(event: AcpEventEnvelope): string {
  if (typeof event.data.content === 'string' && event.data.content.trim()) {
    return event.data.content;
  }
  if (typeof event.data.state === 'string') {
    return `state=${event.data.state}`;
  }
  return JSON.stringify(event.data);
}

export function ProjectSessionsWorkspace(props: { projectState: State<Project> }) {
  const { projectState } = props;
  const client = useClient();
  const meResource = useMemo(
    () => client.go<Root>('/api').follow('me'),
    [client],
  );
  const { data: me } = useSuspenseResource(meResource);
  const {
    sessionsResource,
    selectedSession,
    history,
    create,
    select,
    prompt,
    cancel,
    rename,
    deleteSession,
    ingestEvents,
  } = useAcpSession(projectState, {
    actorUserId: me.id,
    provider: 'team-ai',
    mode: 'CHAT',
    historyLimit: 200,
  });
  const selectedSessionId = selectedSession?.data.id;

  const [sessions, setSessions] = useState<State<AcpSessionSummary>[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [promptText, setPromptText] = useState('');
  const [provider, setProvider] = useState('team-ai');
  const [mode, setMode] = useState('CHAT');
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [isPrompting, setIsPrompting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const allowReconnectRef = useRef(true);
  const latestEventIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    latestEventIdRef.current = history[history.length - 1]?.eventId;
  }, [history]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      let currentPage = await sessionsResource.refresh();
      const allSessions = [...currentPage.collection];
      while (currentPage.hasLink('next')) {
        currentPage = await currentPage.follow('next').get();
        allSessions.push(...currentPage.collection);
      }
      allSessions.sort((a, b) => {
        const left = timestamp(
          a.data.lastActivityAt ?? a.data.startedAt ?? a.data.completedAt,
        );
        const right = timestamp(
          b.data.lastActivityAt ?? b.data.startedAt ?? b.data.completedAt,
        );
        return right - left;
      });
      setSessions(allSessions);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load sessions';
      toast.error(message);
    } finally {
      setSessionsLoading(false);
    }
  }, [sessionsResource]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

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
    if (manual) {
      setStreamStatus('idle');
    }
  }, []);

  const startStream = useCallback(() => {
    if (!selectedSession) {
      return;
    }
    stopStream(false);
    allowReconnectRef.current = true;
    setStreamStatus('connecting');

    const url = new URL('/api/acp', window.location.origin);
    url.searchParams.set('sessionId', selectedSession.data.id);
    const latest = latestEventIdRef.current;
    if (latest) {
      url.searchParams.set('sinceEventId', latest);
    }

    const source = new EventSource(url.toString(), { withCredentials: true });
    source.onopen = () => {
      setStreamStatus('connected');
    };
    const onEvent = (raw: string) => {
      try {
        const parsed = JSON.parse(raw) as AcpEventEnvelope;
        if (parsed.sessionId === selectedSession.data.id) {
          ingestEvents([parsed]);
        }
      } catch {
        // ignore non-json events
      }
    };
    source.addEventListener('acp-event', (event) => {
      onEvent((event as MessageEvent<string>).data);
    });
    source.onmessage = (event) => {
      onEvent(event.data);
    };
    source.onerror = () => {
      setStreamStatus('error');
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
  }, [ingestEvents, selectedSession, stopStream]);

  useEffect(() => {
    if (!selectedSessionId) {
      stopStream(true);
      return;
    }
    startStream();
    return () => stopStream(true);
  }, [selectedSessionId, startStream, stopStream]);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    try {
      const created = await create({
        actorUserId: me.id,
        provider,
        mode,
      });
      await loadSessions();
      toast.success(`Created session ${created.data.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create session';
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [create, loadSessions, me.id, mode, provider]);

  const handleSelect = useCallback(
    async (session: State<AcpSessionSummary>) => {
      try {
        await select({ session: session.data.id });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to select session';
        toast.error(message);
      }
    },
    [select],
  );

  const handlePrompt = useCallback(async () => {
    if (!promptText.trim()) {
      toast.error('Prompt can not be blank');
      return;
    }
    setIsPrompting(true);
    try {
      await prompt({
        prompt: promptText,
      });
      setPromptText('');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to send prompt';
      toast.error(message);
    } finally {
      setIsPrompting(false);
    }
  }, [prompt, promptText]);

  const handleCancel = useCallback(async () => {
    try {
      await cancel({
        reason: 'cancelled from web session panel',
      });
      await loadSessions();
      toast.success('Session cancelled');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to cancel session';
      toast.error(message);
    }
  }, [cancel, loadSessions]);

  const handleRename = useCallback(
    async (session: State<AcpSessionSummary>) => {
      const nextName = window.prompt('Rename session', session.data.name ?? '');
      if (nextName === null) {
        return;
      }
      try {
        await rename({
          session: session.data.id,
          name: nextName,
        });
        await loadSessions();
        toast.success('Session renamed');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to rename session';
        toast.error(message);
      }
    },
    [loadSessions, rename],
  );

  const handleDelete = useCallback(
    async (session: State<AcpSessionSummary>) => {
      const confirmed = window.confirm(
        `Delete ${sessionDisplayName(session)} (${session.data.id})?`,
      );
      if (!confirmed) {
        return;
      }
      try {
        await deleteSession({
          session: session.data.id,
        });
        await loadSessions();
        toast.success('Session deleted');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to delete session';
        toast.error(message);
      }
    },
    [deleteSession, loadSessions],
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <Card className="min-h-[560px]">
        <CardHeader className="space-y-3">
          <CardTitle>ACP Sessions</CardTitle>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              placeholder="provider"
            />
            <Input
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              placeholder="mode"
            />
          </div>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'New Session'}
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[440px] pr-2">
            <div className="space-y-2">
              {sessionsLoading ? (
                <p className="text-sm text-muted-foreground">Loading sessions...</p>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions yet</p>
              ) : (
                sessions.map((session) => {
                  const selected = selectedSession?.data.id === session.data.id;
                  return (
                    <div
                      key={session.data.id}
                      className={`rounded-md border p-2 ${
                        selected ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                    >
                      <button
                        type="button"
                        className="w-full cursor-pointer text-left"
                        onClick={() => void handleSelect(session)}
                      >
                        <p className="truncate text-sm font-medium">
                          {sessionDisplayName(session)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {session.data.state} · {formatDateTime(session.data.lastActivityAt)}
                        </p>
                      </button>
                      <div className="mt-2 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleRename(session)}
                        >
                          Rename
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDelete(session)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="min-h-[560px]">
        <CardHeader className="space-y-2">
          <CardTitle>
            {selectedSession
              ? `${selectedSession.data.id} (${selectedSession.data.state})`
              : 'Select a session'}
          </CardTitle>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Stream: {streamStatus}</span>
            <span>Last Event: {history[history.length - 1]?.eventId ?? 'n/a'}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedSession}
              onClick={() => startStream()}
            >
              Reconnect SSE
            </Button>
            <Button variant="ghost" size="sm" onClick={() => stopStream(true)}>
              Disconnect SSE
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedSession}
              onClick={() => void handleCancel()}
            >
              Cancel Session
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <Textarea
              rows={3}
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              placeholder="Send prompt to selected session"
            />
            <Button
              className="md:self-end"
              disabled={!selectedSession || isPrompting}
              onClick={() => void handlePrompt()}
            >
              {isPrompting ? 'Sending...' : 'Send Prompt'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[360px] pr-2">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No history yet. Select a session to replay history.
              </p>
            ) : (
              <div className="space-y-2">
                {history.map((event: AcpEventEnvelope) => (
                  <div
                    key={event.eventId}
                    className="rounded-md border border-border bg-background p-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{event.type}</span>
                      <span>{formatDateTime(event.emittedAt)}</span>
                    </div>
                    <p className="mt-1 text-sm">{eventSummary(event)}</p>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
