import { Collection, Entity, State } from '@hateoas-ts/resource';
import { useClient } from '@hateoas-ts/resource-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Textarea,
  toast,
} from '@shared/ui';
import { resolveRuntimeApiUrl, runtimeFetch } from '@shared/util-http';
import { Loader2Icon, PauseCircleIcon, PlayCircleIcon, RotateCcwIcon } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

type LocalProject = Entity<
  {
    createdAt: string;
    description: string | null;
    id: string;
    title: string;
    updatedAt: string;
  },
  {
    self: LocalProject;
    collection: LocalProjectCollection;
    conversations: Entity;
  }
>;

type LocalProjectCollection = Entity<Collection<LocalProject>['data']>;

type OrchestrationRoot = Entity<
  {
    capabilities: {
      cancel: boolean;
      resume: boolean;
      retry: boolean;
      streaming: boolean;
    };
    name: string;
  },
  {
    self: OrchestrationRoot;
    sessions: OrchestrationSessionCollection;
    'create-session': Entity;
  }
>;

type OrchestrationSession = Entity<
  {
    createdAt: string;
    currentPhase?: string;
    goal: string;
    id: string;
    lastEventAt?: string;
    projectId: string;
    status: SessionStatus;
    stepCounts: {
      completed: number;
      failed: number;
      running: number;
      total: number;
    };
    strategy: {
      failFast: boolean;
      maxParallelism: number;
      mode: string;
    };
    title: string;
    updatedAt: string;
  },
  {
    self: OrchestrationSession;
    project: LocalProject;
    steps: OrchestrationStepCollection;
    events: Entity;
    stream: Entity;
    cancel: Entity;
    resume: Entity;
    retry: Entity;
  }
>;

type OrchestrationSessionCollection = Entity<Collection<OrchestrationSession>['data']>;

type OrchestrationStep = Entity<
  {
    attempt: number;
    createdAt: string;
    dependsOn: string[];
    id: string;
    kind: StepKind;
    maxAttempts: number;
    sessionId: string;
    status: StepStatus;
    title: string;
    updatedAt: string;
  },
  {
    self: OrchestrationStep;
    session: OrchestrationSession;
    events: Entity;
    retry: Entity;
  }
>;

type OrchestrationStepCollection = Entity<Collection<OrchestrationStep>['data']>;

type SessionStatus =
  | 'PENDING'
  | 'PLANNING'
  | 'RUNNING'
  | 'PAUSED'
  | 'FAILED'
  | 'COMPLETED'
  | 'CANCELLED';

type StepStatus =
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'WAITING_RETRY'
  | 'FAILED'
  | 'COMPLETED'
  | 'CANCELLED';

type StepKind = 'PLAN' | 'IMPLEMENT' | 'VERIFY';

type LocalRoot = Entity<
  {
    capabilities: Record<string, boolean>;
    name: string;
  },
  {
    self: LocalRoot;
    projects: LocalProjectCollection;
    orchestration: OrchestrationRoot;
    settings: Entity;
    agents: Entity;
    providers: Entity;
    'sync-status': Entity;
  }
>;

interface OrchestrationEventDocument {
  _embedded: {
    events: OrchestrationEventPayload[];
  };
}

interface OrchestrationEventPayload {
  at: string;
  id: string;
  payload: Record<string, unknown>;
  sessionId: string;
  stepId?: string;
  type: string;
}

const streamRefreshTypes = new Set([
  'session.running',
  'session.completed',
  'session.failed',
  'session.cancelled',
  'session.resumed',
  'session.retried',
  'step.ready',
  'step.started',
  'step.completed',
  'step.failed',
  'step.retried',
]);

function formatTimestamp(value?: string) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function statusTone(status: SessionStatus | StepStatus) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-700';
    case 'FAILED':
    case 'CANCELLED':
      return 'bg-rose-100 text-rose-700';
    case 'RUNNING':
    case 'READY':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function summarizeEvent(event: OrchestrationEventPayload) {
  if (typeof event.payload.reason === 'string') {
    return event.payload.reason;
  }

  if (typeof event.payload.kind === 'string') {
    return event.payload.kind;
  }

  if (Array.isArray(event.payload.stepIds)) {
    return `${event.payload.stepIds.length} step(s)`;
  }

  return JSON.stringify(event.payload);
}

async function readJson<T>(href: string): Promise<T> {
  const response = await runtimeFetch(href, {
    headers: {
      Accept: 'application/hal+json, application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export default function OrchestrationDashboard() {
  const client = useClient();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const rootResource = useMemo(() => client.go<LocalRoot>('/api'), [client]);
  const [projects, setProjects] = useState<Array<State<LocalProject>>>([]);
  const [orchestrationRoot, setOrchestrationRoot] =
    useState<State<OrchestrationRoot>>();
  const [sessions, setSessions] = useState<Array<State<OrchestrationSession>>>([]);
  const [selectedSession, setSelectedSession] =
    useState<State<OrchestrationSession>>();
  const [steps, setSteps] = useState<Array<State<OrchestrationStep>>>([]);
  const [events, setEvents] = useState<OrchestrationEventPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [streamStatus, setStreamStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'error'
  >('idle');
  const [formState, setFormState] = useState({
    goal: '',
    projectId: '',
    title: '',
  });
  const refreshTimeoutRef = useRef<number | undefined>(undefined);

  const reloadSelectedSession = useCallback(
    async (targetSessionId: string) => {
      const nextSessionsState = await orchestrationRoot
        ?.follow('sessions')
        .get();

      if (!nextSessionsState) {
        return;
      }

      setSessions(nextSessionsState.collection as Array<State<OrchestrationSession>>);

      const nextSelectedSession =
        (nextSessionsState.collection as Array<State<OrchestrationSession>>).find(
          (item) => item.data.id === targetSessionId,
        ) ?? (await client.go<OrchestrationSession>(
          `/api/orchestration/sessions/${targetSessionId}`,
        ).get());

      setSelectedSession(nextSelectedSession);

      const nextStepsState = await nextSelectedSession.follow('steps').get();
      setSteps(nextStepsState.collection as Array<State<OrchestrationStep>>);

      const nextEvents = await readJson<OrchestrationEventDocument>(
        nextSelectedSession.getLink('events')?.href ??
          `/api/orchestration/sessions/${targetSessionId}/events`,
      );
      setEvents(nextEvents._embedded.events);
    },
    [client, orchestrationRoot],
  );

  const loadDashboard = useCallback(async () => {
    setLoading(true);

    try {
      const rootState = await rootResource.get();
      const [projectCollectionState, orchestrationRootState] = await Promise.all([
        rootState.follow('projects').get(),
        rootState.follow('orchestration').get(),
      ]);

      const nextProjects =
        projectCollectionState.collection as Array<State<LocalProject>>;
      const nextSessionsState = await orchestrationRootState.follow('sessions').get();
      const nextSessions =
        nextSessionsState.collection as Array<State<OrchestrationSession>>;

      setProjects(nextProjects);
      setOrchestrationRoot(orchestrationRootState);
      setSessions(nextSessions);
      setFormState((current) => ({
        ...current,
        projectId: current.projectId || nextProjects[0]?.data.id || '',
      }));

      const nextSelected =
        nextSessions.find((session) => session.data.id === sessionId) ??
        nextSessions[0];

      if (nextSelected) {
        setSelectedSession(nextSelected);
        const [stepState, eventDocument] = await Promise.all([
          nextSelected.follow('steps').get(),
          readJson<OrchestrationEventDocument>(
            nextSelected.getLink('events')?.href ??
              `/api/orchestration/sessions/${nextSelected.data.id}/events`,
          ),
        ]);
        setSteps(stepState.collection as Array<State<OrchestrationStep>>);
        setEvents(eventDocument._embedded.events);
      } else {
        setSelectedSession(undefined);
        setSteps([]);
        setEvents([]);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load orchestration',
      );
    } finally {
      setLoading(false);
    }
  }, [rootResource, sessionId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!selectedSession) {
      setStreamStatus('idle');
      return;
    }

    const streamHref = selectedSession.getLink('stream')?.href;

    if (!streamHref) {
      setStreamStatus('idle');
      return;
    }

    const abortController = new AbortController();
    let disposed = false;

    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = window.setTimeout(() => {
        void reloadSelectedSession(selectedSession.data.id);
      }, 80);
    };

    const start = async () => {
      setStreamStatus('connecting');

      try {
        const response = await runtimeFetch(streamHref, {
          headers: {
            Accept: 'text/event-stream',
          },
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Failed to open stream: ${response.status}`);
        }

        setStreamStatus('connected');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!disposed) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          let boundaryIndex = buffer.indexOf('\n\n');

          while (boundaryIndex >= 0) {
            const chunk = buffer.slice(0, boundaryIndex);
            buffer = buffer.slice(boundaryIndex + 2);
            boundaryIndex = buffer.indexOf('\n\n');

            const lines = chunk
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean);
            const eventType = lines
              .find((line) => line.startsWith('event:'))
              ?.slice('event:'.length)
              .trim();
            const dataLine = lines
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice('data:'.length).trim())
              .join('\n');

            if (!eventType || !dataLine) {
              continue;
            }

            if (eventType === 'connected' || eventType === 'heartbeat') {
              continue;
            }

            try {
              const event = JSON.parse(dataLine) as OrchestrationEventPayload;

              if (event.sessionId !== selectedSession.data.id) {
                continue;
              }

              setEvents((current) => {
                if (current.some((item) => item.id === event.id)) {
                  return current;
                }

                return [...current, event].sort((left, right) =>
                  left.at.localeCompare(right.at),
                );
              });

              if (streamRefreshTypes.has(event.type)) {
                scheduleRefresh();
              }
            } catch {
              continue;
            }
          }
        }
      } catch (error) {
        if (!disposed) {
          setStreamStatus('error');
          console.error('[orchestration] stream error', error);
        }
      }
    };

    void start();

    return () => {
      disposed = true;
      abortController.abort();
      setStreamStatus('idle');

      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [reloadSelectedSession, selectedSession]);

  const handleCreateSession = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!orchestrationRoot || !formState.projectId || !formState.title.trim()) {
        return;
      }

      setSubmitting(true);

      try {
        const created = await orchestrationRoot.follow('create-session').post({
          data: {
            projectId: formState.projectId,
            title: formState.title.trim(),
            goal: formState.goal.trim() || formState.title.trim(),
          },
        });

        const nextSession = created as State<OrchestrationSession>;
        toast.success(`Started orchestration ${nextSession.data.title}`);
        setFormState((current) => ({
          ...current,
          title: '',
          goal: '',
        }));
        navigate(`/orchestration/${nextSession.data.id}`);
        await reloadSelectedSession(nextSession.data.id);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to create session',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [formState.goal, formState.projectId, formState.title, navigate, orchestrationRoot, reloadSelectedSession],
  );

  const handleSelectSession = useCallback(
    async (nextSession: State<OrchestrationSession>) => {
      navigate(`/orchestration/${nextSession.data.id}`);
      await reloadSelectedSession(nextSession.data.id);
    },
    [navigate, reloadSelectedSession],
  );

  const triggerSessionAction = useCallback(
    async (rel: 'cancel' | 'resume' | 'retry') => {
      if (!selectedSession || !selectedSession.hasLink(rel)) {
        return;
      }

      try {
        await selectedSession.follow(rel).post({ data: {} });
        await reloadSelectedSession(selectedSession.data.id);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : `Failed to ${rel} session`,
        );
      }
    },
    [reloadSelectedSession, selectedSession],
  );

  const handleRetryStep = useCallback(
    async (stepState: State<OrchestrationStep>) => {
      try {
        await stepState.follow('retry').post({ data: {} });
        await reloadSelectedSession(stepState.data.sessionId);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to retry step',
        );
      }
    },
    [reloadSelectedSession],
  );

  const streamUrl = selectedSession?.getLink('stream')?.href
    ? resolveRuntimeApiUrl(selectedSession.getLink('stream')?.href ?? '')
    : null;

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Orchestration Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Monitor local orchestration sessions, inspect steps, and stream state
          changes from the desktop server.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Start New Orchestration</CardTitle>
          <CardDescription>
            Create a new local orchestration session against a selected project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[220px_1fr] lg:grid-cols-[220px_280px_1fr_auto]" onSubmit={handleCreateSession}>
            <Select
              value={formState.projectId}
              onValueChange={(projectId) =>
                setFormState((current) => ({ ...current, projectId }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.data.id} value={project.data.id}>
                    {project.data.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Session title"
              value={formState.title}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
            <Textarea
              className="min-h-24"
              placeholder="Goal / prompt for orchestration"
              value={formState.goal}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  goal: event.target.value,
                }))
              }
            />
            <Button
              type="submit"
              disabled={
                submitting || !formState.projectId || formState.title.trim().length === 0
              }
            >
              {submitting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Starting…
                </>
              ) : (
                'Start'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="min-h-0">
          <CardHeader>
            <CardTitle>Sessions</CardTitle>
            <CardDescription>
              {sessions.length} session{sessions.length === 1 ? '' : 's'} available
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0">
            <ScrollArea className="h-[540px] pr-3">
              <div className="space-y-3">
                {loading ? (
                  <div className="text-sm text-muted-foreground">Loading…</div>
                ) : sessions.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No orchestration sessions yet.
                  </div>
                ) : (
                  sessions.map((session) => {
                    const isSelected = selectedSession?.data.id === session.data.id;

                    return (
                      <button
                        key={session.data.id}
                        type="button"
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-accent'
                        }`}
                        onClick={() => void handleSelectSession(session)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{session.data.title}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {session.data.goal}
                            </div>
                          </div>
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusTone(
                              session.data.status,
                            )}`}
                          >
                            {session.data.status}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>
                            {session.data.stepCounts.completed}/
                            {session.data.stepCounts.total} completed
                          </span>
                          <span>{formatTimestamp(session.data.updatedAt)}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="grid min-h-0 gap-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>
                    {selectedSession?.data.title ?? 'Select a session'}
                  </CardTitle>
                  <CardDescription>
                    {selectedSession?.data.goal ??
                      'Choose a session from the list to inspect its runtime.'}
                  </CardDescription>
                </div>
                {selectedSession ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${statusTone(
                        selectedSession.data.status,
                      )}`}
                    >
                      {selectedSession.data.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      stream: {streamStatus}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void triggerSessionAction('cancel')}
                      disabled={selectedSession.data.status === 'COMPLETED'}
                    >
                      <PauseCircleIcon className="size-4" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void triggerSessionAction('resume')}
                      disabled={selectedSession.data.status === 'COMPLETED'}
                    >
                      <PlayCircleIcon className="size-4" />
                      Resume
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void triggerSessionAction('retry')}
                      disabled={selectedSession.data.status !== 'FAILED'}
                    >
                      <RotateCcwIcon className="size-4" />
                      Retry
                    </Button>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <MetricCard label="Total" value={selectedSession?.data.stepCounts.total ?? 0} />
              <MetricCard
                label="Completed"
                value={selectedSession?.data.stepCounts.completed ?? 0}
              />
              <MetricCard label="Running" value={selectedSession?.data.stepCounts.running ?? 0} />
              <MetricCard label="Failed" value={selectedSession?.data.stepCounts.failed ?? 0} />
            </CardContent>
          </Card>

          <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card className="min-h-0">
              <CardHeader>
                <CardTitle>Steps</CardTitle>
                <CardDescription>
                  Ordered execution plan for the selected orchestration session.
                </CardDescription>
              </CardHeader>
              <CardContent className="min-h-0">
                <ScrollArea className="h-[360px] pr-3">
                  <div className="space-y-3">
                    {steps.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        No step data available.
                      </div>
                    ) : (
                      steps.map((step) => (
                        <div
                          key={step.data.id}
                          className="rounded-lg border p-3 text-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">{step.data.title}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {step.data.kind} · attempt {step.data.attempt}/
                                {step.data.maxAttempts}
                              </div>
                            </div>
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusTone(
                                step.data.status,
                              )}`}
                            >
                              {step.data.status}
                            </span>
                          </div>
                          {step.data.dependsOn.length > 0 ? (
                            <div className="mt-2 text-xs text-muted-foreground">
                              Depends on: {step.data.dependsOn.join(', ')}
                            </div>
                          ) : null}
                          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{formatTimestamp(step.data.updatedAt)}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={step.data.status !== 'FAILED'}
                              onClick={() => void handleRetryStep(step)}
                            >
                              Retry step
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="min-h-0">
              <CardHeader>
                <CardTitle>Event Timeline</CardTitle>
                <CardDescription>
                  Persisted orchestration events with live stream updates.
                </CardDescription>
              </CardHeader>
              <CardContent className="min-h-0">
                <ScrollArea className="h-[360px] pr-3">
                  <div className="space-y-3">
                    {events.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        No orchestration events yet.
                      </div>
                    ) : (
                      events.map((event) => (
                        <div
                          key={event.id}
                          className="rounded-lg border p-3 text-sm"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium">{event.type}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatTimestamp(event.at)}
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {summarizeEvent(event)}
                          </div>
                          {event.stepId ? (
                            <div className="mt-2 text-[11px] text-muted-foreground">
                              step: {event.stepId}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
                {streamUrl ? (
                  <>
                    <Separator className="my-4" />
                    <div className="text-xs text-muted-foreground">
                      Stream source: {streamUrl}
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard(props: { label: string; value: number }) {
  const { label, value } = props;

  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
