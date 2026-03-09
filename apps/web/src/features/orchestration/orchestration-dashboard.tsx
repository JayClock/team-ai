import { Collection, Entity, State } from '@hateoas-ts/resource';
import { useClient } from '@hateoas-ts/resource-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
  Separator,
  toast,
} from '@shared/ui';
import { resolveRuntimeApiUrl, runtimeFetch } from '@shared/util-http';
import {
  ArrowLeftIcon,
  FolderGit2Icon,
  Loader2Icon,
  PauseCircleIcon,
  PlayCircleIcon,
  RotateCcwIcon,
  SparklesIcon,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collectRuntimeOutputByStep,
  formatTimestamp,
  statusTone,
  summarizeEvent,
  type OrchestrationArtifactView,
  type SessionStatus,
  type StepKind,
  type StepStatus,
} from './orchestration-dashboard-utils';

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
  }
>;

type OrchestrationSession = Entity<
  {
    createdAt: string;
    currentPhase?: StepKind | null;
    executionMode: string;
    goal: string;
    id: string;
    lastEventAt?: string | null;
    provider: string;
    traceId?: string;
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
    workspaceRoot?: string | null;
  },
  {
    self: OrchestrationSession;
    project: Entity;
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
    artifacts: OrchestrationArtifactView[];
    attempt: number;
    completedAt?: string | null;
    createdAt: string;
    dependsOn: string[];
    errorCode?: string | null;
    errorMessage?: string | null;
    id: string;
    input?: Record<string, unknown> | null;
    kind: StepKind;
    maxAttempts: number;
    output?: Record<string, unknown> | null;
    role?: string | null;
    runtimeCursor?: string | null;
    runtimeSessionId?: string | null;
    sessionId: string;
    startedAt?: string | null;
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

type LocalRoot = Entity<
  {
    capabilities: Record<string, boolean>;
    name: string;
  },
  {
    self: LocalRoot;
    orchestration: OrchestrationRoot;
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

const orderedStageKinds: StepKind[] = ['PLAN', 'IMPLEMENT', 'VERIFY'];

const stageMeta: Record<
  StepKind,
  {
    description: string;
    index: string;
    title: string;
  }
> = {
  PLAN: {
    description: 'Shape the approach, scope, and execution intent.',
    index: '01',
    title: 'Plan',
  },
  IMPLEMENT: {
    description: 'Run the change against the selected local repository.',
    index: '02',
    title: 'Implement',
  },
  VERIFY: {
    description: 'Review outputs and determine whether the run is complete.',
    index: '03',
    title: 'Verify',
  },
};

const streamRefreshTypes = new Set([
  'session.running',
  'session.completed',
  'session.failed',
  'session.cancelled',
  'session.resumed',
  'session.retried',
  'step.ready',
  'step.started',
  'step.runtime.event',
  'step.cancelled',
  'step.completed',
  'step.failed',
  'step.retried',
]);

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

function summarizeArtifactContent(content: Record<string, unknown>): string {
  const summary = content.summary;
  if (typeof summary === 'string' && summary.trim().length > 0) {
    return summary;
  }

  const verdict = content.verdict;
  if (typeof verdict === 'string' && verdict.trim().length > 0) {
    return verdict;
  }

  const keys = Object.keys(content);
  if (keys.length === 0) {
    return 'No structured content';
  }

  return keys.slice(0, 3).join(' · ');
}

function resolveSelectedSession(
  sessions: Array<State<OrchestrationSession>>,
  targetSessionId?: string,
): State<OrchestrationSession> | undefined {
  if (!targetSessionId) {
    return sessions[0];
  }

  return sessions.find((session) => session.data.id === targetSessionId) ?? sessions[0];
}

export default function OrchestrationDashboard() {
  const client = useClient();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const rootResource = useMemo(() => client.go<LocalRoot>('/api'), [client]);
  const [sessions, setSessions] = useState<Array<State<OrchestrationSession>>>([]);
  const [selectedSession, setSelectedSession] = useState<State<OrchestrationSession>>();
  const [steps, setSteps] = useState<Array<State<OrchestrationStep>>>([]);
  const [events, setEvents] = useState<OrchestrationEventPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'error'
  >('idle');
  const [activeAction, setActiveAction] = useState<'cancel' | 'resume' | 'retry' | null>(
    null,
  );
  const [retryingStepId, setRetryingStepId] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<number | undefined>(undefined);

  const loadSessionData = useCallback(
    async (targetSessionId?: string) => {
      const rootState = await rootResource.get();
      const orchestrationRootState = await rootState.follow('orchestration').get();
      const nextSessionsState = await orchestrationRootState.follow('sessions').get();
      const nextSessions =
        nextSessionsState.collection as Array<State<OrchestrationSession>>;

      setSessions(nextSessions);

      const nextSelected = resolveSelectedSession(nextSessions, targetSessionId);

      if (!nextSelected) {
        setSelectedSession(undefined);
        setSteps([]);
        setEvents([]);
        return;
      }

      const hydratedSession =
        nextSessions.find((session) => session.data.id === nextSelected.data.id) ??
        (await client.go<OrchestrationSession>(
          `/api/orchestration/sessions/${nextSelected.data.id}`,
        ).get());

      setSelectedSession(hydratedSession);

      const [nextStepsState, nextEvents] = await Promise.all([
        hydratedSession.follow('steps').get(),
        readJson<OrchestrationEventDocument>(
          hydratedSession.getLink('events')?.href ??
            `/api/orchestration/sessions/${hydratedSession.data.id}/events`,
        ),
      ]);

      setSteps(nextStepsState.collection as Array<State<OrchestrationStep>>);
      setEvents(nextEvents._embedded.events);
    },
    [client, rootResource],
  );

  const reloadSelectedSession = useCallback(
    async (targetSessionId: string) => {
      await loadSessionData(targetSessionId);
    },
    [loadSessionData],
  );

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      setLoading(true);

      try {
        await loadSessionData(sessionId);
      } catch (error) {
        if (!disposed) {
          toast.error(
            error instanceof Error ? error.message : 'Failed to load session',
          );
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      disposed = true;
    };
  }, [loadSessionData, sessionId]);

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

            if (!eventType || !dataLine || eventType === 'connected' || eventType === 'heartbeat') {
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

      setActiveAction(rel);

      try {
        await selectedSession.follow(rel).post({ data: {} });
        await reloadSelectedSession(selectedSession.data.id);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : `Failed to ${rel} session`,
        );
      } finally {
        setActiveAction(null);
      }
    },
    [reloadSelectedSession, selectedSession],
  );

  const handleRetryStep = useCallback(
    async (stepState: State<OrchestrationStep>) => {
      if (!stepState.hasLink('retry')) {
        return;
      }

      setRetryingStepId(stepState.data.id);

      try {
        await stepState.follow('retry').post({ data: {} });
        await reloadSelectedSession(stepState.data.sessionId);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to retry step',
        );
      } finally {
        setRetryingStepId(null);
      }
    },
    [reloadSelectedSession],
  );

  const runtimeOutputByStep = useMemo(
    () => collectRuntimeOutputByStep(events),
    [events],
  );
  const recentEvents = useMemo(
    () =>
      [...events]
        .sort((left, right) => right.at.localeCompare(left.at))
        .slice(0, 14),
    [events],
  );
  const stepByKind = useMemo(
    () =>
      steps.reduce<Partial<Record<StepKind, State<OrchestrationStep>>>>((accumulator, step) => {
        accumulator[step.data.kind] = step;
        return accumulator;
      }, {}),
    [steps],
  );
  const streamUrl = selectedSession?.getLink('stream')?.href
    ? resolveRuntimeApiUrl(selectedSession.getLink('stream')?.href ?? '')
    : null;

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 px-6 py-16">
        <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-600 shadow-sm">
          <Loader2Icon className="size-4 animate-spin" />
          Loading session details...
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full overflow-hidden bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_40%,#ffffff_100%)]">
      <div className="absolute inset-x-0 top-0 h-72 bg-[linear-gradient(135deg,rgba(14,165,233,0.18),rgba(59,130,246,0.04),rgba(255,255,255,0))]" />
      <div className="relative mx-auto grid min-h-full w-full max-w-[1600px] gap-6 px-4 py-6 md:px-8 xl:grid-cols-[300px_minmax(0,1fr)_320px] xl:py-8">
        <aside className="flex min-h-0 flex-col gap-6">
          <Card className="border-slate-200/80 bg-white/90 shadow-[0_20px_80px_-48px_rgba(15,23,42,0.4)] backdrop-blur">
            <CardHeader className="gap-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-sky-700 uppercase">
                <SparklesIcon className="size-3.5" />
                Session View
              </div>
              <CardTitle className="text-xl">Execution sessions</CardTitle>
              <CardDescription className="text-sm leading-6">
                Switch between recent local runs or start a fresh session from the
                repository entry page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                className="w-full justify-start"
                onClick={() => navigate('/orchestration')}
                variant="outline"
              >
                <ArrowLeftIcon className="size-4" />
                New Session
              </Button>
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <MetricCard
                  label="Sessions"
                  value={sessions.length.toString()}
                />
                <MetricCard
                  label="Running"
                  value={sessions
                    .filter((session) => session.data.status === 'RUNNING')
                    .length.toString()}
                />
                <MetricCard
                  label="Failed"
                  value={sessions
                    .filter((session) => session.data.status === 'FAILED')
                    .length.toString()}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 flex-1 border-slate-200/80 bg-white/90 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base">Recent sessions</CardTitle>
              <CardDescription>
                {sessions.length} session{sessions.length === 1 ? '' : 's'} available
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0">
              <ScrollArea className="h-[420px] pr-3 xl:h-[calc(100vh-340px)]">
                <div className="space-y-3">
                  {sessions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                      No sessions yet. Return to the entry page to start the first
                      run.
                    </div>
                  ) : (
                    sessions.map((session) => {
                      const isSelected = selectedSession?.data.id === session.data.id;

                      return (
                        <button
                          key={session.data.id}
                          className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                            isSelected
                              ? 'border-sky-300 bg-sky-50 text-sky-950 shadow-sm'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                          onClick={() => void handleSelectSession(session)}
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {session.data.title}
                              </p>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                                {session.data.goal}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${statusTone(
                                session.data.status,
                              )}`}
                            >
                              {session.data.status}
                            </span>
                          </div>
                          <div className="mt-3 space-y-1 text-[11px] text-slate-500">
                            <div className="truncate">
                              {session.data.workspaceRoot ?? 'No workspace path'}
                            </div>
                            <div>
                              {session.data.stepCounts.completed}/
                              {session.data.stepCounts.total} completed
                            </div>
                            <div>{formatTimestamp(session.data.updatedAt)}</div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </aside>

        <main className="flex min-h-0 flex-col gap-6">
          <Card className="border-slate-200/80 bg-white/92 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.45)] backdrop-blur">
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium tracking-[0.16em] text-slate-600 uppercase">
                    <FolderGit2Icon className="size-3.5" />
                    Local workspace session
                  </div>
                  <div>
                    <CardTitle className="text-3xl tracking-tight text-slate-950">
                      {selectedSession?.data.title ?? 'Session not found'}
                    </CardTitle>
                    <CardDescription className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                      {selectedSession?.data.goal ??
                        'Select a session from the left rail or return to the entry page.'}
                    </CardDescription>
                  </div>
                </div>
                {selectedSession ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone(
                        selectedSession.data.status,
                      )}`}
                    >
                      {selectedSession.data.status}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                      stream: {streamStatus}
                    </span>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            {selectedSession ? (
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SessionStat
                  label="Workspace"
                  value={selectedSession.data.workspaceRoot ?? 'Not attached'}
                />
                <SessionStat
                  label="Current phase"
                  value={selectedSession.data.currentPhase ?? 'Pending'}
                />
                <SessionStat
                  label="Updated"
                  value={formatTimestamp(selectedSession.data.updatedAt)}
                />
                <SessionStat
                  label="Provider"
                  value={`${selectedSession.data.provider} · ${selectedSession.data.executionMode}`}
                />
              </CardContent>
            ) : null}
          </Card>

          {selectedSession ? (
            <>
              <Card className="border-slate-200/80 bg-white/92 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-lg">Request context</CardTitle>
                  <CardDescription>
                    The repository path and user request that launched this session.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                    <div className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase">
                      Request
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                      {selectedSession.data.goal}
                    </p>
                  </div>
                  <div className="grid gap-3">
                    <DetailRow
                      label="Workspace root"
                      value={selectedSession.data.workspaceRoot ?? '—'}
                    />
                    <DetailRow
                      label="Created"
                      value={formatTimestamp(selectedSession.data.createdAt)}
                    />
                    <DetailRow
                      label="Last event"
                      value={formatTimestamp(selectedSession.data.lastEventAt)}
                    />
                    <DetailRow
                      label="Trace ID"
                      value={selectedSession.data.traceId ?? '—'}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="min-h-0 border-slate-200/80 bg-white/92 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-lg">Execution feed</CardTitle>
                  <CardDescription>
                    Runtime output, structured artifacts, and failures grouped by
                    stage.
                  </CardDescription>
                </CardHeader>
                <CardContent className="min-h-0">
                  <div className="space-y-4">
                    {orderedStageKinds.map((kind) => {
                      const step = stepByKind[kind];
                      const runtimeOutput = step
                        ? (runtimeOutputByStep[step.data.id] ?? []).join('')
                        : '';

                      return (
                        <div
                          key={kind}
                          className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5"
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-3">
                              <div className="inline-flex w-fit items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                                <span>{stageMeta[kind].index}</span>
                                <span>{stageMeta[kind].title}</span>
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold text-slate-950">
                                  {step?.data.title ?? stageMeta[kind].title}
                                </h3>
                                <p className="mt-1 text-sm leading-6 text-slate-600">
                                  {stageMeta[kind].description}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone(
                                  step?.data.status ?? 'PENDING',
                                )}`}
                              >
                                {step?.data.status ?? 'PENDING'}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                                {step
                                  ? `attempt ${step.data.attempt}/${step.data.maxAttempts}`
                                  : 'waiting'}
                              </span>
                            </div>
                          </div>

                          {step ? (
                            <div className="mt-4 grid gap-4">
                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <DetailRow
                                  label="Role"
                                  value={step.data.role ?? 'specialist'}
                                />
                                <DetailRow
                                  label="Started"
                                  value={formatTimestamp(step.data.startedAt)}
                                />
                                <DetailRow
                                  label="Completed"
                                  value={formatTimestamp(step.data.completedAt)}
                                />
                                <DetailRow
                                  label="Runtime session"
                                  value={step.data.runtimeSessionId ?? 'Not started'}
                                />
                              </div>

                              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
                                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                                  <div className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase">
                                    Runtime output
                                  </div>
                                  <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                                    {runtimeOutput.length > 0
                                      ? runtimeOutput
                                      : 'No streamed output for this stage yet.'}
                                  </pre>
                                </div>

                                <div className="space-y-3">
                                  {step.data.errorCode || step.data.errorMessage ? (
                                    <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                                      <div className="text-xs font-medium tracking-[0.16em] uppercase">
                                        Failure
                                      </div>
                                      <div className="mt-2 font-medium">
                                        {step.data.errorCode ?? 'STEP_ERROR'}
                                      </div>
                                      <p className="mt-2 leading-6">
                                        {step.data.errorMessage ?? 'No error message'}
                                      </p>
                                    </div>
                                  ) : null}

                                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                                    <div className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase">
                                      Artifacts
                                    </div>
                                    {step.data.artifacts.length === 0 ? (
                                      <p className="mt-3 text-sm text-slate-500">
                                        No structured artifacts persisted yet.
                                      </p>
                                    ) : (
                                      <div className="mt-3 space-y-3">
                                        {step.data.artifacts.map((artifact) => (
                                          <div
                                            key={artifact.id}
                                            className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3"
                                          >
                                            <div className="flex items-center justify-between gap-3">
                                              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white">
                                                {artifact.kind}
                                              </span>
                                              <span className="text-[11px] text-slate-500">
                                                {formatTimestamp(artifact.updatedAt)}
                                              </span>
                                            </div>
                                            <p className="mt-3 text-sm leading-6 text-slate-600">
                                              {summarizeArtifactContent(artifact.content)}
                                            </p>
                                            <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-white p-3 text-xs leading-6 text-slate-700">
                                              {JSON.stringify(artifact.content, null, 2)}
                                            </pre>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-4 rounded-3xl border border-dashed border-slate-200 bg-white/80 px-4 py-6 text-sm text-slate-500">
                              This stage has not been materialized yet.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 bg-white/92 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-lg">Event timeline</CardTitle>
                  <CardDescription>
                    Most recent persisted events with live stream updates.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {recentEvents.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                      No events available yet.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {recentEvents.map((event) => (
                        <div
                          key={event.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                              <div className="text-sm font-medium text-slate-950">
                                {event.type}
                              </div>
                              <div className="text-xs leading-5 text-slate-500">
                                {summarizeEvent(event)}
                              </div>
                            </div>
                            <div className="text-xs text-slate-500">
                              {formatTimestamp(event.at)}
                            </div>
                          </div>
                          {event.stepId ? (
                            <div className="mt-2 text-[11px] text-slate-500">
                              step: {event.stepId}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-slate-200/80 bg-white/92 backdrop-blur">
              <CardContent className="flex flex-col items-start gap-4 px-6 py-10">
                <div className="text-lg font-semibold text-slate-950">
                  Session not found
                </div>
                <p className="max-w-xl text-sm leading-6 text-slate-600">
                  The requested session could not be loaded. Return to the entry page
                  and create a new one, or choose an existing session from the left
                  rail.
                </p>
                <Button onClick={() => navigate('/orchestration')}>New Session</Button>
              </CardContent>
            </Card>
          )}
        </main>

        <aside className="flex min-h-0 flex-col gap-6">
          <Card className="border-slate-200/80 bg-slate-950 text-slate-100 shadow-[0_20px_80px_-48px_rgba(15,23,42,0.9)]">
            <CardHeader>
              <CardTitle className="text-base text-white">Session controls</CardTitle>
              <CardDescription className="text-slate-300">
                Control the selected run without leaving the detail view.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                <ActionButton
                  busy={activeAction === 'cancel'}
                  disabled={!selectedSession?.hasLink('cancel')}
                  icon={<PauseCircleIcon className="size-4" />}
                  label="Cancel"
                  onClick={() => void triggerSessionAction('cancel')}
                />
                <ActionButton
                  busy={activeAction === 'resume'}
                  disabled={!selectedSession?.hasLink('resume')}
                  icon={<PlayCircleIcon className="size-4" />}
                  label="Resume"
                  onClick={() => void triggerSessionAction('resume')}
                />
                <ActionButton
                  busy={activeAction === 'retry'}
                  disabled={!selectedSession?.hasLink('retry')}
                  icon={<RotateCcwIcon className="size-4" />}
                  label="Retry session"
                  onClick={() => void triggerSessionAction('retry')}
                />
              </div>

              <Separator className="bg-slate-800" />

              <div className="space-y-3 text-sm">
                <SidebarDetail label="Status" value={selectedSession?.data.status ?? '—'} />
                <SidebarDetail label="Stream" value={streamStatus} />
                <SidebarDetail
                  label="Fail fast"
                  value={selectedSession?.data.strategy.failFast ? 'Enabled' : 'Disabled'}
                />
                <SidebarDetail
                  label="Parallelism"
                  value={selectedSession?.data.strategy.maxParallelism.toString() ?? '—'}
                />
                <SidebarDetail
                  label="Mode"
                  value={selectedSession?.data.strategy.mode ?? '—'}
                />
                <SidebarDetail label="Source" value={streamUrl ?? 'No stream URL'} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-white/92 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base">Execution stages</CardTitle>
              <CardDescription>
                Compact stage status for the fixed Plan, Implement, Verify flow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {orderedStageKinds.map((kind) => {
                const step = stepByKind[kind];
                const canRetry =
                  step?.hasLink('retry') &&
                  ['FAILED', 'WAITING_RETRY'].includes(step.data.status);

                return (
                  <div
                    key={kind}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase">
                          {stageMeta[kind].index}
                        </div>
                        <div className="mt-1 text-sm font-medium text-slate-950">
                          {stageMeta[kind].title}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusTone(
                          step?.data.status ?? 'PENDING',
                        )}`}
                      >
                        {step?.data.status ?? 'PENDING'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {stageMeta[kind].description}
                    </p>
                    {step ? (
                      <>
                        <div className="mt-3 space-y-1 text-[11px] text-slate-500">
                          <div>role: {step.data.role ?? 'specialist'}</div>
                          <div>updated: {formatTimestamp(step.data.updatedAt)}</div>
                          <div>artifacts: {step.data.artifacts.length}</div>
                        </div>
                        <Button
                          className="mt-3 w-full"
                          disabled={!canRetry || retryingStepId === step.data.id}
                          onClick={() => void handleRetryStep(step)}
                          size="sm"
                          variant="outline"
                        >
                          {retryingStepId === step.data.id ? (
                            <>
                              <Loader2Icon className="size-4 animate-spin" />
                              Retrying...
                            </>
                          ) : (
                            <>
                              <RotateCcwIcon className="size-4" />
                              Retry step
                            </>
                          )}
                        </Button>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ActionButton(props: {
  busy: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  const { busy, disabled, icon, label, onClick } = props;

  return (
    <Button
      className="w-full justify-start border-slate-800 bg-slate-900 text-slate-100 hover:bg-slate-800"
      disabled={disabled || busy}
      onClick={onClick}
      variant="outline"
    >
      {busy ? <Loader2Icon className="size-4 animate-spin" /> : icon}
      {label}
    </Button>
  );
}

function MetricCard(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="text-[11px] font-medium tracking-[0.16em] text-slate-500 uppercase">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function SessionStat(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="text-[11px] font-medium tracking-[0.16em] text-slate-500 uppercase">
        {label}
      </div>
      <div className="mt-2 break-words text-sm leading-6 text-slate-700">{value}</div>
    </div>
  );
}

function DetailRow(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-medium tracking-[0.16em] text-slate-500 uppercase">
        {label}
      </div>
      <div className="mt-2 break-words text-sm leading-6 text-slate-700">{value}</div>
    </div>
  );
}

function SidebarDetail(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
      <div className="text-[11px] font-medium tracking-[0.16em] text-slate-400 uppercase">
        {label}
      </div>
      <div className="mt-1 break-words text-sm text-slate-100">{value}</div>
    </div>
  );
}
