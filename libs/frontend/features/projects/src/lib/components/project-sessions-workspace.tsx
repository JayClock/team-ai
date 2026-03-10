import { State } from '@hateoas-ts/resource';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { useAcpSession } from '@features/project-conversations';
import {
  AcpEventEnvelope,
  AcpSessionSummary,
  Project,
  Root,
  type AcpCompleteEventData,
  type AcpErrorEventData,
  type AcpMessageEventData,
  type AcpSessionEventData,
  type AcpToolCallEventData,
  type AcpToolResultEventData,
} from '@shared/schema';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Input,
  Message,
  MessageContent,
  MessageResponse,
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  ScrollArea,
  Spinner,
  toast,
} from '@shared/ui';
import {
  getCurrentDesktopRuntimeConfig,
  resolveRuntimeApiUrl,
} from '@shared/util-http';
import { BotIcon, SparklesIcon, WrenchIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STREAM_RETRY_DELAY_MS = 1500;

type StreamStatus = 'idle' | 'connecting' | 'connected' | 'error';

type ChatEntry = {
  content: string;
  emittedAt: string;
  id: string;
  role: 'assistant' | 'system' | 'user';
  tone?: 'default' | 'thought';
};

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

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function eventLabel(event: AcpEventEnvelope): string {
  switch (event.type) {
    case 'tool_call':
      return 'Tool Call';
    case 'tool_result':
      return 'Tool Result';
    case 'session':
      return 'Session';
    case 'plan':
      return 'Plan';
    case 'usage':
      return 'Usage';
    case 'mode':
      return 'Mode';
    case 'config':
      return 'Config';
    case 'complete':
      return 'Complete';
    case 'error':
      return 'Error';
    case 'status':
      return 'Status';
    case 'message':
      return 'Message';
  }
}

function eventHeadline(event: AcpEventEnvelope): string {
  switch (event.type) {
    case 'tool_call':
      return event.data.title ?? event.data.toolName ?? 'tool call';
    case 'tool_result':
      return event.data.title ?? event.data.toolName ?? 'tool result';
    case 'plan':
      return `${event.data.entries.length} planned item(s)`;
    case 'usage':
      return `${event.data.used}/${event.data.size} context tokens`;
    case 'session':
      return event.data.reason ?? event.data.title ?? event.data.state ?? 'session';
    case 'mode':
      return event.data.currentModeId;
    case 'config':
      return `${event.data.configOptions.length} config option(s)`;
    case 'complete':
      return event.data.stopReason ?? event.data.reason ?? 'completed';
    case 'error':
      return event.error?.message ?? event.data.message ?? 'error';
    case 'status':
      return event.data.reason ?? event.data.state ?? 'status';
    case 'message':
      return event.data.role ?? 'message';
  }
}

function summarizeSessionEvent(event: AcpEventEnvelope): string | null {
  switch (event.type) {
    case 'session': {
      const data = event.data as AcpSessionEventData;
      if (data.reason === 'session_created') {
        return '会话已创建，可以直接继续对话。';
      }
      if (data.title) {
        return `会话标题已更新为 ${data.title}。`;
      }
      if (data.state) {
        return `会话状态已变更为 ${data.state}。`;
      }
      return null;
    }
    case 'complete': {
      const data = event.data as AcpCompleteEventData;
      if (data.state === 'CANCELLED' || data.stopReason === 'cancelled') {
        return '本次对话已取消。';
      }
      return '本轮对话已结束。';
    }
    case 'error': {
      const data = event.data as AcpErrorEventData;
      return data.message ?? event.error?.message ?? '执行过程中发生错误。';
    }
    default:
      return null;
  }
}

function buildChatEntries(history: AcpEventEnvelope[]): ChatEntry[] {
  const messages: Array<ChatEntry & { chunkKey?: string }> = [];

  for (const event of history) {
    if (event.type === 'message') {
      const data = event.data as AcpMessageEventData;
      const content = asText(data.content);
      if (!content) {
        continue;
      }

      const role =
        data.role === 'user'
          ? 'user'
          : data.role === 'thought'
            ? 'assistant'
            : 'assistant';
      const chunkKey = `${role}:${data.messageId ?? event.eventId}:${data.role ?? 'assistant'}`;
      const previous = messages[messages.length - 1];

      if (previous && previous.chunkKey === chunkKey) {
        previous.content += content;
        previous.id = event.eventId;
        previous.emittedAt = event.emittedAt;
        continue;
      }

      messages.push({
        id: event.eventId,
        role,
        emittedAt: event.emittedAt,
        content,
        tone: data.role === 'thought' ? 'thought' : 'default',
        chunkKey,
      });
      continue;
    }

    const summary = summarizeSessionEvent(event);
    if (!summary) {
      continue;
    }

    messages.push({
      id: event.eventId,
      role: 'system',
      emittedAt: event.emittedAt,
      content: summary,
    });
  }

  return messages.map(({ chunkKey: _chunkKey, ...message }) => message);
}

function renderEventDetails(event: AcpEventEnvelope) {
  const rawPayload = event.data.payload;

  if (event.type === 'tool_call' || event.type === 'tool_result') {
    const data =
      event.type === 'tool_call'
        ? (event.data as AcpToolCallEventData)
        : (event.data as AcpToolResultEventData);
    const primaryValue =
      event.type === 'tool_call'
        ? (data as AcpToolCallEventData).input ?? data.rawInput
        : (data as AcpToolResultEventData).output ?? data.rawOutput;

    return (
      <div className="mt-2 space-y-2">
        {primaryValue !== undefined ? (
          <pre className="overflow-x-auto rounded-md bg-muted/70 p-2 text-xs">
            {typeof primaryValue === 'string' ? primaryValue : formatJson(primaryValue)}
          </pre>
        ) : null}
        {data.locations && data.locations.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {data.locations.map((location, index) => (
              <span key={`${location.path}-${index}`}>
                {location.path}
                {location.line ? `:${location.line}` : ''}
              </span>
            ))}
          </div>
        ) : null}
        {rawPayload ? (
          <details className="rounded-md bg-muted/40 p-2">
            <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-muted-foreground">
              raw payload
            </summary>
            <pre className="mt-2 overflow-x-auto text-xs">{formatJson(rawPayload)}</pre>
          </details>
        ) : null}
      </div>
    );
  }

  if (event.type === 'plan') {
    return (
      <div className="mt-2 space-y-2">
        {event.data.entries.map((entry, index) => (
          <div key={`${event.eventId}-${index}`} className="rounded-md bg-muted/70 p-2 text-xs">
            <div className="font-medium">{entry.content}</div>
            <div className="mt-1 text-muted-foreground">
              {entry.priority} · {entry.status}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const summary = summarizeSessionEvent(event);
  if (summary) {
    return <p className="mt-2 text-sm break-words">{summary}</p>;
  }

  if (rawPayload) {
    return (
      <pre className="mt-2 overflow-x-auto rounded-md bg-muted/70 p-2 text-xs">
        {formatJson(rawPayload)}
      </pre>
    );
  }

  return null;
}

export function ProjectSessionsWorkspace(props: {
  projectState: State<Project>;
  initialSessionId?: string;
  pendingPrompt?: string | null;
  onPendingPromptConsumed?: () => void;
  onSessionNavigate?: (sessionId: string) => void;
}) {
  const {
    projectState,
    initialSessionId,
    pendingPrompt,
    onPendingPromptConsumed,
    onSessionNavigate,
  } = props;
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
    provider: 'codex',
    mode: 'CHAT',
    historyLimit: 200,
  });
  const selectedSessionId = selectedSession?.data.id;

  const [sessions, setSessions] = useState<State<AcpSessionSummary>[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [provider, setProvider] = useState('codex');
  const [mode, setMode] = useState('CHAT');
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [isPrompting, setIsPrompting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const allowReconnectRef = useRef(true);
  const latestEventIdRef = useRef<string | undefined>(undefined);
  const initialSelectionAppliedRef = useRef<string | null>(null);
  const pendingPromptKeyRef = useRef<string | null>(null);

  const chatEntries = useMemo(() => buildChatEntries(history), [history]);
  const sideEvents = useMemo(
    () => history.filter((event) => event.type !== 'message'),
    [history],
  );

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

    const url = new URL(resolveRuntimeApiUrl('/api/acp'));
    url.searchParams.set('sessionId', selectedSession.data.id);
    const desktopRuntimeConfig = getCurrentDesktopRuntimeConfig();
    if (desktopRuntimeConfig) {
      url.searchParams.set(
        'desktopSessionToken',
        desktopRuntimeConfig.desktopSessionToken,
      );
    }
    const latest = latestEventIdRef.current;
    if (latest) {
      url.searchParams.set('since', latest);
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

  const selectSessionFromList = useCallback(
    async (
      session: State<AcpSessionSummary>,
      navigateToSession = true,
    ) => {
      try {
        await select({ session: session.data.id });
        if (navigateToSession) {
          onSessionNavigate?.(session.data.id);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to select session';
        toast.error(message);
      }
    },
    [onSessionNavigate, select],
  );

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    try {
      const created = await create({
        actorUserId: me.id,
        provider,
        mode,
      });
      await loadSessions();
      onSessionNavigate?.(created.data.id);
      toast.success(`Created session ${created.data.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create session';
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [create, loadSessions, me.id, mode, onSessionNavigate, provider]);

  const handleSelect = useCallback(
    async (session: State<AcpSessionSummary>) => {
      await selectSessionFromList(session);
    },
    [selectSessionFromList],
  );

  const handlePromptSubmit = useCallback(
    async ({ text }: { files: unknown[]; text: string }) => {
      const trimmed = text.trim();
      if (!trimmed) {
        toast.error('Prompt can not be blank');
        return;
      }

      setIsPrompting(true);
      try {
        const targetSession =
          selectedSession ??
          (await create({
            actorUserId: me.id,
            provider,
            mode,
          }));

        await prompt({
          session: targetSession.data.id,
          prompt: trimmed,
        });
        await loadSessions();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to send prompt';
        toast.error(message);
      } finally {
        setIsPrompting(false);
      }
    },
    [create, loadSessions, me.id, mode, prompt, provider, selectedSession],
  );

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

  useEffect(() => {
    if (!initialSessionId || sessionsLoading) {
      return;
    }
    if (selectedSession?.data.id === initialSessionId) {
      initialSelectionAppliedRef.current = initialSessionId;
      return;
    }
    if (initialSelectionAppliedRef.current === initialSessionId) {
      return;
    }
    const target = sessions.find((session) => session.data.id === initialSessionId);
    if (!target) {
      return;
    }
    initialSelectionAppliedRef.current = initialSessionId;
    void selectSessionFromList(target, false);
  }, [
    initialSessionId,
    selectSessionFromList,
    selectedSession?.data.id,
    sessions,
    sessionsLoading,
  ]);

  useEffect(() => {
    const text = pendingPrompt?.trim();
    if (!text || !selectedSession) {
      return;
    }
    const promptKey = `${selectedSession.data.id}:${text}`;
    if (pendingPromptKeyRef.current === promptKey) {
      return;
    }
    pendingPromptKeyRef.current = promptKey;
    onPendingPromptConsumed?.();
    setIsPrompting(true);
    void prompt({
      session: selectedSession.data.id,
      prompt: text,
    })
      .then(async () => {
        await loadSessions();
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : 'Failed to send prompt';
        toast.error(message);
      })
      .finally(() => {
        setIsPrompting(false);
      });
  }, [loadSessions, onPendingPromptConsumed, pendingPrompt, prompt, selectedSession]);

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="min-h-[640px]">
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
          <ScrollArea className="h-[520px] pr-2">
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
                      className={`rounded-lg border p-3 ${
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
                        <p className="mt-1 text-xs text-muted-foreground">
                          {session.data.state} · {formatDateTime(session.data.lastActivityAt)}
                        </p>
                      </button>
                      <div className="mt-3 flex gap-2">
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        <Card className="flex min-h-[640px] flex-col overflow-hidden">
          <CardHeader className="space-y-3 border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>
                  {selectedSession
                    ? sessionDisplayName(selectedSession as State<AcpSessionSummary>)
                    : 'ACP Conversation'}
                </CardTitle>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Stream: {streamStatus}</span>
                  {selectedSession ? <span>Status: {selectedSession.data.state}</span> : null}
                  {selectedSession?.data.provider ? (
                    <span>Provider: {selectedSession.data.provider}</span>
                  ) : null}
                  {selectedSession?.data.mode ? <span>Mode: {selectedSession.data.mode}</span> : null}
                  {selectedSession?.data.cwd ? <span>CWD: {selectedSession.data.cwd}</span> : null}
                </div>
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
            </div>
          </CardHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            <Conversation className="min-h-0 flex-1">
              <ConversationContent className="gap-4 px-4 py-5 md:px-6">
                {chatEntries.length === 0 ? (
                  <ConversationEmptyState
                    icon={<BotIcon className="size-10 text-muted-foreground/60" />}
                    title="暂无对话"
                    description="选择一个 ACP session，或者直接在下方发送第一条消息。"
                  />
                ) : (
                  <>
                    {chatEntries.map((entry) => (
                      <Message
                        key={entry.id}
                        from={entry.role === 'user' ? 'user' : 'assistant'}
                        className={
                          entry.role === 'system'
                            ? 'mx-auto max-w-2xl'
                            : entry.tone === 'thought'
                              ? 'opacity-85'
                              : undefined
                        }
                      >
                        <MessageContent
                          className={
                            entry.role === 'system'
                              ? 'mx-auto rounded-full border bg-muted/50 px-3 py-2 text-xs text-muted-foreground'
                              : entry.tone === 'thought'
                                ? 'rounded-lg border border-dashed border-border/70 bg-muted/40 px-4 py-3'
                                : undefined
                          }
                        >
                          {entry.tone === 'thought' ? (
                            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                              <SparklesIcon className="size-3.5" />
                              <span>Assistant reasoning</span>
                            </div>
                          ) : null}
                          <MessageResponse>{entry.content}</MessageResponse>
                          <div className="mt-2 text-[11px] text-muted-foreground">
                            {formatDateTime(entry.emittedAt)}
                          </div>
                        </MessageContent>
                      </Message>
                    ))}
                    {isPrompting ? (
                      <Message key="assistant-loading" from="assistant">
                        <MessageContent>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Spinner className="size-4" />
                            Waiting for ACP session response...
                          </div>
                        </MessageContent>
                      </Message>
                    ) : null}
                  </>
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <div className="shrink-0 border-t bg-background/95 p-4 backdrop-blur">
              <PromptInput onSubmit={handlePromptSubmit}>
                <PromptInputBody className="rounded-xl border border-input bg-background shadow-sm transition-all duration-200 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <PromptInputTextarea
                    placeholder={
                      selectedSession
                        ? 'Continue this ACP session...'
                        : 'Start a new ACP session by sending your first message...'
                    }
                    className="min-h-20 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                    disabled={isPrompting}
                    aria-label="ACP session prompt"
                  />
                </PromptInputBody>
                <PromptInputFooter className="mt-2 flex items-center justify-between">
                  <PromptInputTools>
                    <div className="text-xs text-muted-foreground">
                      {selectedSession ? selectedSession.data.id : 'Will create a new session'}
                    </div>
                  </PromptInputTools>
                  <PromptInputSubmit status={isPrompting ? 'submitted' : undefined} />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </Card>

        <Card className="min-h-[640px]">
          <CardHeader className="space-y-2 border-b">
            <CardTitle>Runtime Inspector</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tool calls, session updates, plans, and raw ACP events stay here.
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <ScrollArea className="h-[540px] pr-2">
              {sideEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No runtime events yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {sideEvents.map((event) => (
                    <div
                      key={event.eventId}
                      className="rounded-lg border border-border bg-background p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {(event.type === 'tool_call' || event.type === 'tool_result') ? (
                            <WrenchIcon className="size-4 text-muted-foreground" />
                          ) : (
                            <SparklesIcon className="size-4 text-muted-foreground" />
                          )}
                          <div>
                            <div className="text-sm font-medium">{eventLabel(event)}</div>
                            <div className="text-xs text-muted-foreground">
                              {eventHeadline(event)}
                            </div>
                          </div>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatDateTime(event.emittedAt)}
                        </div>
                      </div>
                      {renderEventDetails(event)}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
