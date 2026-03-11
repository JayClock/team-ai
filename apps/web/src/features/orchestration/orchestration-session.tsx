import { Collection, Entity, State } from '@hateoas-ts/resource';
import { useClient } from '@hateoas-ts/resource-react';
import {
  Button,
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
  collectArtifactsByStep,
  formatTimestamp,
  statusTone,
  summarizeEvent,
  type OrchestrationArtifactView,
  type SessionStatus,
  type StepKind,
  type StepStatus,
} from './orchestration-dashboard-utils';

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
    cwd?: string | null;
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
    description: '整理方案、范围和执行意图。',
    index: '01',
    title: '规划',
  },
  IMPLEMENT: {
    description: '在选定的本地仓库中执行改动。',
    index: '02',
    title: '实施',
  },
  VERIFY: {
    description: '检查输出结果并判断本次执行是否完成。',
    index: '03',
    title: '验证',
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
    throw new Error(`请求失败：${response.status}`);
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
    return '没有结构化内容';
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

function sessionStatusLabel(status: SessionStatus | StepStatus): string {
  switch (status) {
    case 'PENDING':
      return '待处理';
    case 'PLANNING':
      return '规划中';
    case 'READY':
      return '就绪';
    case 'RUNNING':
      return '执行中';
    case 'PAUSED':
      return '已暂停';
    case 'WAITING_RETRY':
      return '等待重试';
    case 'FAILED':
      return '失败';
    case 'COMPLETED':
      return '已完成';
    case 'CANCELLED':
      return '已取消';
    default:
      return status;
  }
}

function streamStatusLabel(status: 'idle' | 'connecting' | 'connected' | 'error'): string {
  switch (status) {
    case 'idle':
      return '空闲';
    case 'connecting':
      return '连接中';
    case 'connected':
      return '已连接';
    case 'error':
      return '异常';
    default:
      return status;
  }
}

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    'session.running': '会话执行中',
    'session.completed': '会话已完成',
    'session.failed': '会话失败',
    'session.cancelled': '会话已取消',
    'session.resumed': '会话已恢复',
    'session.retried': '会话已重试',
    'step.ready': '阶段就绪',
    'step.started': '阶段开始',
    'step.runtime.event': '运行事件',
    'step.cancelled': '阶段已取消',
    'step.completed': '阶段已完成',
    'step.failed': '阶段失败',
    'step.retried': '阶段已重试',
  };

  return labels[type] ?? type;
}

function resolveSessionAgentRole(executionMode?: string | null): 'DEVELOPER' | 'ROUTA' {
  return executionMode === 'ROUTA' ? 'ROUTA' : 'DEVELOPER';
}

function sessionModeLabel(executionMode?: string | null): 'Direct' | 'Multi-Agent' {
  return resolveSessionAgentRole(executionMode) === 'ROUTA' ? 'Multi-Agent' : 'Direct';
}

function sessionAgentTone(role: 'DEVELOPER' | 'ROUTA'): string {
  return role === 'ROUTA'
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : 'border-sky-200 bg-sky-50 text-sky-700';
}

function actionLabel(action: 'cancel' | 'resume' | 'retry'): string {
  switch (action) {
    case 'cancel':
      return '取消';
    case 'resume':
      return '恢复';
    case 'retry':
      return '重试';
    default:
      return action;
  }
}

interface ChatFeedMessage {
  content: string;
  id: string;
  meta: string[];
  preformatted?: boolean;
  tone: 'assistant' | 'system' | 'user';
}

function looksLikeStructuredRuntimeLog(text: string): boolean {
  const normalizedLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (normalizedLines.length === 0) {
    return true;
  }

  if (normalizedLines[0]?.startsWith('{') || normalizedLines[0]?.startsWith('[')) {
    return true;
  }

  if (
    text.includes('"summary":') ||
    text.includes('"tasks":') ||
    text.includes('"verification":')
  ) {
    return true;
  }

  if (normalizedLines.length > 1 && normalizedLines[0] === normalizedLines[1]) {
    return true;
  }

  if (
    normalizedLines.some((line) => line.startsWith('gateway:')) ||
    /[A-Z]{3,}(?:_[A-Z0-9]+)+/.test(text)
  ) {
    return true;
  }

  return false;
}

function shouldShowRuntimeMessage(text: string, stepKind?: StepKind): boolean {
  const normalized = text.trim();
  if (normalized.length === 0) {
    return false;
  }

  // Main chat feed should behave like a normal conversation, not an internal
  // orchestration log. Planning/verification runtime output is usually
  // structured control data rather than user-facing assistant text.
  if (stepKind !== 'IMPLEMENT') {
    return false;
  }

  if (looksLikeStructuredRuntimeLog(normalized)) {
    return false;
  }

  return true;
}

function shouldShowSystemEventInChat(type: string): boolean {
  return (
    type === 'session.completed' ||
    type === 'session.failed' ||
    type === 'session.cancelled' ||
    type === 'session.resumed' ||
    type === 'session.retried'
  );
}

function summarizeSystemEventForChat(event: OrchestrationEventPayload): string {
  const reason =
    typeof event.payload.reason === 'string' ? event.payload.reason.trim() : '';

  switch (event.type) {
    case 'session.completed':
      return '本次会话已完成，结果和产物已经整理到右侧协作栏。';
    case 'session.failed':
      if (reason === 'step-waiting-retry') {
        return '执行在某个阶段停住了，当前正在等待重试。右侧可以直接重试对应阶段。';
      }
      return '本次会话执行失败。失败阶段、最近活动和产物摘要都保留在右侧协作栏。';
    case 'session.cancelled':
      return '本次会话已取消。';
    case 'session.resumed':
      return '会话已恢复执行。';
    case 'session.retried':
      return '会话已经重新开始执行。';
    default:
      return summarizeEvent(event);
  }
}

export default function OrchestrationSessionPage() {
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
      await rootResource.get();
      const nextSessionsState = await client.go<OrchestrationSessionCollection>('/api/sessions').get();
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
          `/api/sessions/${nextSelected.data.id}`,
        ).get());

      setSelectedSession(hydratedSession);

      const [nextStepsState, nextEvents] = await Promise.all([
        hydratedSession.follow('steps').get(),
        readJson<OrchestrationEventDocument>(
          hydratedSession.getLink('events')?.href ??
            `/api/sessions/${hydratedSession.data.id}/events`,
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
            error instanceof Error ? error.message : '加载会话失败',
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
          throw new Error(`打开事件流失败：${response.status}`);
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
          error instanceof Error ? error.message : `会话${actionLabel(rel)}操作失败`,
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
          error instanceof Error ? error.message : '重试阶段失败',
        );
      } finally {
        setRetryingStepId(null);
      }
    },
    [reloadSelectedSession],
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
  const stepById = useMemo(
    () =>
      steps.reduce<Record<string, State<OrchestrationStep>>>((accumulator, step) => {
        accumulator[step.data.id] = step;
        return accumulator;
      }, {}),
    [steps],
  );
  const selectedStageTitle = selectedSession?.data.currentPhase
    ? stageMeta[selectedSession.data.currentPhase].title
    : '等待开始';
  const selectedSessionAgentRole = selectedSession
    ? resolveSessionAgentRole(selectedSession.data.executionMode)
    : 'DEVELOPER';
  const selectedSessionMode = selectedSession
    ? sessionModeLabel(selectedSession.data.executionMode)
    : 'Direct';
  const activitySummary = selectedSession
    ? `${selectedSession.data.stepCounts.completed}/${selectedSession.data.stepCounts.total} 阶段完成`
    : '暂无会话';
  const streamUrl = selectedSession?.getLink('stream')?.href
    ? resolveRuntimeApiUrl(selectedSession.getLink('stream')?.href ?? '')
    : null;
  const artifactFeed = useMemo(
    () =>
      collectArtifactsByStep(steps.map((step) => step.data))
        .sort((left, right) =>
          right.artifact.updatedAt.localeCompare(left.artifact.updatedAt),
        )
        .slice(0, 8),
    [steps],
  );
  const chatFeed = useMemo(() => {
    if (!selectedSession) {
      return [];
    }

    const nextFeed: ChatFeedMessage[] = [
      {
        content: selectedSession.data.goal,
        id: `goal-${selectedSession.data.id}`,
        meta: [
          selectedSession.data.cwd ?? '未绑定目录',
          formatTimestamp(selectedSession.data.createdAt),
        ],
        tone: 'user',
      },
      {
        content: `会话已载入，当前模式为 ${sessionModeLabel(selectedSession.data.executionMode)} · ${resolveSessionAgentRole(selectedSession.data.executionMode)}。当前处于${selectedStageTitle}阶段，执行提供方 ${selectedSession.data.provider}，当前进度 ${activitySummary}。`,
        id: `summary-${selectedSession.data.id}`,
        meta: [`流状态 ${streamStatusLabel(streamStatus)}`],
        tone: 'assistant',
      },
    ];
    let lastAssistantRuntimeText: string | null = null;
    let lastSystemMessageText: string | null = null;

    const chronologicalEvents = [...events].sort((left, right) =>
      left.at.localeCompare(right.at),
    );

    for (const event of chronologicalEvents) {
      const relatedStep = event.stepId ? stepById[event.stepId] : undefined;
      const stepTitle = relatedStep
        ? `${stageMeta[relatedStep.data.kind].title} · ${relatedStep.data.title}`
        : undefined;

      if (event.type === 'step.runtime.event') {
        const runtimeText = summarizeEvent(event);
        const stepKind = relatedStep?.data.kind;

        if (!shouldShowRuntimeMessage(runtimeText, stepKind)) {
          continue;
        }

        if (lastAssistantRuntimeText === runtimeText.trim()) {
          continue;
        }

        lastAssistantRuntimeText = runtimeText.trim();
        nextFeed.push({
          content: runtimeText,
          id: event.id,
          meta: [
            stepTitle ?? '运行输出',
            relatedStep?.data.role ?? '执行代理',
            formatTimestamp(event.at),
          ],
          preformatted: runtimeText.includes('\n'),
          tone: 'assistant',
        });
        continue;
      }

      if (!shouldShowSystemEventInChat(event.type)) {
        continue;
      }

      const systemMessage = summarizeSystemEventForChat(event);
      if (lastSystemMessageText === systemMessage) {
        continue;
      }

      lastSystemMessageText = systemMessage;
      nextFeed.push({
        content: systemMessage,
        id: event.id,
        meta: [formatTimestamp(event.at)],
        tone: 'system',
      });
    }

    return nextFeed;
  }, [
    activitySummary,
    events,
    selectedSession,
    selectedStageTitle,
    stepById,
    streamStatus,
  ]);

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 px-6 py-16">
        <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-600 shadow-sm">
          <Loader2Icon className="size-4 animate-spin" />
          正在加载会话详情...
        </div>
      </div>
    );
  }

  const runningSessionsCount = sessions.filter(
    (session) => session.data.status === 'RUNNING',
  ).length;
  const failedSessionsCount = sessions.filter(
    (session) => session.data.status === 'FAILED',
  ).length;

  return (
    <div className="relative min-h-full overflow-hidden bg-[radial-gradient(circle_at_top,#dbeafe_0%,#eef6ff_26%,#f8fafc_56%,#ffffff_100%)]">
      <div className="absolute inset-x-0 top-0 h-72 bg-[linear-gradient(135deg,rgba(14,165,233,0.18),rgba(59,130,246,0.06),rgba(255,255,255,0))]" />
      <div className="relative mx-auto flex min-h-full max-w-[1680px] flex-col px-4 py-4 md:px-6 xl:px-8 xl:py-6">
        <header className="mb-4 rounded-[32px] border border-slate-200/80 bg-white/88 p-4 shadow-[0_24px_80px_-54px_rgba(15,23,42,0.38)] backdrop-blur md:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  className="rounded-full"
                  onClick={() => navigate('/orchestration')}
                  size="sm"
                  variant="outline"
                >
                  <ArrowLeftIcon className="size-4" />
                  返回会话列表
                </Button>
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-sky-700 uppercase">
                  <SparklesIcon className="size-3.5" />
                  Session Workspace
                </div>
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
                  {selectedSession?.data.title ?? '未找到会话'}
                </h1>
                <p className="max-w-4xl text-sm leading-6 text-slate-600">
                  {selectedSession?.data.goal ??
                    '请从左侧选择一个会话，或返回列表页重新发起执行。'}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <NavigatorMetric
                label="会话总数"
                value={sessions.length.toString()}
              />
              <NavigatorMetric
                label="执行中"
                value={runningSessionsCount.toString()}
              />
              <NavigatorMetric
                label="失败"
                value={failedSessionsCount.toString()}
              />
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
          <aside className="min-h-0">
            <div className="flex h-full min-h-[720px] flex-col overflow-hidden rounded-[30px] border border-slate-200/80 bg-white/92 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.45)] backdrop-blur">
              <div className="border-b border-slate-200/80 px-4 py-4">
                <div className="text-[11px] font-medium tracking-[0.18em] text-slate-500 uppercase">
                  左侧导航
                </div>
                <h2 className="mt-2 text-lg font-semibold text-slate-950">Sessions</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  保留会话切换职责，不再承担输出和协作细节。
                </p>
              </div>

              <div className="border-b border-slate-200/80 px-4 py-4">
                <Button
                  className="w-full justify-start rounded-2xl"
                  onClick={() => navigate('/orchestration')}
                  variant="outline"
                >
                  <SparklesIcon className="size-4" />
                  新建会话
                </Button>
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-3 p-4">
                  {sessions.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
                      还没有会话。返回入口页即可发起第一次执行。
                    </div>
                  ) : (
                    sessions.map((session) => {
                      const isSelected = selectedSession?.data.id === session.data.id;

                      return (
                        <button
                          key={session.data.id}
                          className={`w-full rounded-[26px] border px-4 py-4 text-left transition ${
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
                              <div className="mt-3 flex flex-wrap gap-2">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium tracking-[0.14em] text-slate-600 uppercase">
                                  {sessionModeLabel(session.data.executionMode)}
                                </span>
                                <span
                                  className={`rounded-full border px-2 py-1 text-[10px] font-medium tracking-[0.14em] uppercase ${sessionAgentTone(
                                    resolveSessionAgentRole(session.data.executionMode),
                                  )}`}
                                >
                                  {resolveSessionAgentRole(session.data.executionMode)}
                                </span>
                              </div>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${statusTone(
                                session.data.status,
                              )}`}
                            >
                              {sessionStatusLabel(session.data.status)}
                            </span>
                          </div>
                          <div className="mt-4 grid gap-2 text-[11px] text-slate-500">
                            <div className="truncate">
                              {session.data.cwd ?? '暂无目录路径'}
                            </div>
                            <div>
                              {session.data.stepCounts.completed}/
                              {session.data.stepCounts.total} 已完成
                            </div>
                            <div>{formatTimestamp(session.data.updatedAt)}</div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </aside>

          <main className="min-h-0">
            <div className="flex h-full min-h-[720px] flex-col overflow-hidden rounded-[34px] border border-slate-200/80 bg-white/94 shadow-[0_28px_90px_-56px_rgba(15,23,42,0.45)] backdrop-blur">
              <div className="border-b border-slate-200/80 px-4 py-4 md:px-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium tracking-[0.16em] text-slate-600 uppercase">
                      <FolderGit2Icon className="size-3.5" />
                      Chat Panel
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium tracking-[0.16em] text-slate-600 uppercase">
                        {selectedSessionMode}
                      </span>
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-medium tracking-[0.16em] uppercase ${sessionAgentTone(
                          selectedSessionAgentRole,
                        )}`}
                      >
                        {selectedSessionAgentRole}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                        {selectedSession?.data.title ?? '等待选择会话'}
                      </h2>
                      <p className="text-sm leading-6 text-slate-600">
                        中间主区负责承载会话目标、阶段输出和事件流，作为 orchestration session 的 chat panel。
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone(
                        selectedSession?.data.status ?? 'PENDING',
                      )}`}
                    >
                      {selectedSession
                        ? sessionStatusLabel(selectedSession.data.status)
                        : '未选择'}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                      模式：{selectedSessionMode}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                      Agent：{selectedSessionAgentRole}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                      当前阶段：{selectedStageTitle}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                      事件流：{streamStatusLabel(streamStatus)}
                    </span>
                  </div>
                </div>
              </div>

              {selectedSession ? (
                <>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="flex flex-col gap-4 p-4 md:p-6">
                      {chatFeed.map((message) => (
                        <ChatBubble
                          key={message.id}
                          meta={message.meta}
                          tone={message.tone}
                        >
                          {message.preformatted ? (
                            <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-inherit">
                              {message.content}
                            </pre>
                          ) : (
                            <p className="whitespace-pre-wrap text-sm leading-6 text-inherit/85">
                              {message.content}
                            </p>
                          )}
                        </ChatBubble>
                      ))}

                      {chatFeed.length <= 2 ? (
                        <div className="mx-auto max-w-xl rounded-[26px] border border-dashed border-slate-200 bg-white/70 px-5 py-6 text-center text-sm leading-6 text-slate-500">
                          会话已创建，但还没有更多执行输出。后续 runtime event 会直接以普通聊天消息继续出现在这里。
                        </div>
                      ) : null}
                    </div>
                  </ScrollArea>

                  <div className="border-t border-slate-200/80 px-4 py-4 md:px-6">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                        <div className="text-[11px] font-medium tracking-[0.16em] text-slate-500 uppercase">
                          协作提示
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          当前页面已经承担 chat panel 和协作栏职责：中间查看需求、输出和事件，右侧集中处理阶段重试、结构化产物和状态信息。
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                            {activitySummary}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                            流地址：{streamUrl ?? '暂无'}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-3">
                        <SessionActionButton
                          busy={activeAction === 'cancel'}
                          disabled={!selectedSession.hasLink('cancel')}
                          icon={<PauseCircleIcon className="size-4" />}
                          label="取消"
                          onClick={() => void triggerSessionAction('cancel')}
                        />
                        <SessionActionButton
                          busy={activeAction === 'resume'}
                          disabled={!selectedSession.hasLink('resume')}
                          icon={<PlayCircleIcon className="size-4" />}
                          label="恢复"
                          onClick={() => void triggerSessionAction('resume')}
                        />
                        <SessionActionButton
                          busy={activeAction === 'retry'}
                          disabled={!selectedSession.hasLink('retry')}
                          icon={<RotateCcwIcon className="size-4" />}
                          label="重试会话"
                          onClick={() => void triggerSessionAction('retry')}
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-start justify-center gap-4 px-6 py-10">
                  <div className="text-lg font-semibold text-slate-950">
                    未找到会话
                  </div>
                  <p className="max-w-xl text-sm leading-6 text-slate-600">
                    无法加载请求的会话。你可以返回入口页新建会话，或者从左侧选择一个已有会话。
                  </p>
                  <Button onClick={() => navigate('/orchestration')}>新建会话</Button>
                </div>
              )}
            </div>
          </main>

          <aside className="min-h-0">
            <div className="flex h-full min-h-[720px] flex-col overflow-hidden rounded-[30px] border border-slate-900/90 bg-slate-950 text-slate-100 shadow-[0_22px_80px_-54px_rgba(15,23,42,0.92)]">
              <div className="border-b border-slate-800 px-4 py-4">
                <div className="text-[11px] font-medium tracking-[0.18em] text-slate-400 uppercase">
                  协作栏
                </div>
                <h2 className="mt-2 text-lg font-semibold text-white">
                  Collaboration Rail
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  右侧固定承载控制、阶段状态、产物摘要和最近活动。
                </p>
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-4 p-4">
                  <div className="rounded-[26px] border border-slate-800 bg-slate-900/80 p-4">
                    <div className="text-[11px] font-medium tracking-[0.16em] text-slate-400 uppercase">
                      会话上下文
                    </div>
                    <div className="mt-3 space-y-3">
                      <SidebarField
                        label="状态"
                        value={selectedSession ? sessionStatusLabel(selectedSession.data.status) : '—'}
                      />
                      <SidebarField
                        label="事件流"
                        value={streamStatusLabel(streamStatus)}
                      />
                      <SidebarField
                        label="模式"
                        value={selectedSessionMode}
                      />
                      <SidebarField
                        label="执行角色"
                        value={selectedSessionAgentRole}
                      />
                      <SidebarField
                        label="工作区"
                        value={selectedSession?.data.cwd ?? '—'}
                      />
                      <SidebarField
                        label="策略"
                        value={
                          selectedSession
                            ? `${selectedSession.data.strategy.mode} · 并行 ${selectedSession.data.strategy.maxParallelism}`
                            : '—'
                        }
                      />
                      <SidebarField
                        label="快速失败"
                        value={selectedSession?.data.strategy.failFast ? '开启' : '关闭'}
                      />
                    </div>
                  </div>

                  <Separator className="bg-slate-800" />

                  <div className="space-y-3">
                    <div className="text-[11px] font-medium tracking-[0.16em] text-slate-400 uppercase">
                      阶段协作
                    </div>
                    {orderedStageKinds.map((kind) => {
                      const step = stepByKind[kind];
                      const canRetry =
                        step?.hasLink('retry') &&
                        ['FAILED', 'WAITING_RETRY'].includes(step.data.status);

                      return (
                        <div
                          key={kind}
                          className="rounded-[24px] border border-slate-800 bg-slate-900/70 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-[10px] font-medium tracking-[0.16em] text-slate-500 uppercase">
                                {stageMeta[kind].index}
                              </div>
                              <div className="mt-1 text-sm font-medium text-slate-100">
                                {step?.data.title ?? stageMeta[kind].title}
                              </div>
                            </div>
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusTone(
                                step?.data.status ?? 'PENDING',
                              )}`}
                            >
                              {sessionStatusLabel(step?.data.status ?? 'PENDING')}
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-400">
                            {stageMeta[kind].description}
                          </p>
                          {step ? (
                            <>
                              <div className="mt-3 space-y-1 text-[11px] text-slate-400">
                                <div>角色：{step.data.role ?? '执行代理'}</div>
                                <div>更新时间：{formatTimestamp(step.data.updatedAt)}</div>
                                <div>产物数：{step.data.artifacts.length}</div>
                              </div>
                              <Button
                                className="mt-3 w-full border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
                                disabled={!canRetry || retryingStepId === step.data.id}
                                onClick={() => void handleRetryStep(step)}
                                size="sm"
                                variant="outline"
                              >
                                {retryingStepId === step.data.id ? (
                                  <>
                                    <Loader2Icon className="size-4 animate-spin" />
                                    重试中...
                                  </>
                                ) : (
                                  <>
                                    <RotateCcwIcon className="size-4" />
                                    重试阶段
                                  </>
                                )}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <Separator className="bg-slate-800" />

                  <div className="space-y-3">
                    <div className="text-[11px] font-medium tracking-[0.16em] text-slate-400 uppercase">
                      最新产物
                    </div>
                    {artifactFeed.length === 0 ? (
                      <div className="rounded-[24px] border border-dashed border-slate-700 bg-slate-900/40 px-4 py-5 text-sm text-slate-400">
                        还没有结构化产物。
                      </div>
                    ) : (
                      artifactFeed.map((entry) => (
                        <div
                          key={entry.artifact.id}
                          className="rounded-[22px] border border-slate-800 bg-slate-900/70 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-900">
                              {entry.artifact.kind}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {formatTimestamp(entry.artifact.updatedAt)}
                            </span>
                          </div>
                          <div className="mt-3 text-xs leading-5 text-slate-400">
                            {entry.stepTitle}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-200">
                            {summarizeArtifactContent(entry.artifact.content)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  <Separator className="bg-slate-800" />

                  <div className="space-y-3">
                    <div className="text-[11px] font-medium tracking-[0.16em] text-slate-400 uppercase">
                      最近活动
                    </div>
                    {recentEvents.length === 0 ? (
                      <div className="rounded-[24px] border border-dashed border-slate-700 bg-slate-900/40 px-4 py-5 text-sm text-slate-400">
                        暂无活动事件。
                      </div>
                    ) : (
                      recentEvents.slice(0, 8).map((event) => (
                        <div
                          key={event.id}
                          className="rounded-[22px] border border-slate-800 bg-slate-900/70 px-4 py-3"
                        >
                          <div className="text-sm font-medium text-slate-100">
                            {eventTypeLabel(event.type)}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-400">
                            {summarizeEvent(event)}
                          </div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            {formatTimestamp(event.at)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </ScrollArea>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function SessionActionButton(props: {
  busy: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  const { busy, disabled, icon, label, onClick } = props;

  return (
    <Button
      className="w-full justify-start rounded-2xl border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
      disabled={disabled || busy}
      onClick={onClick}
      variant="outline"
    >
      {busy ? <Loader2Icon className="size-4 animate-spin" /> : icon}
      {label}
    </Button>
  );
}

function NavigatorMetric(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-3">
      <div className="text-[11px] font-medium tracking-[0.16em] text-slate-500 uppercase">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function ChatBubble(props: {
  meta?: string[];
  tone: 'assistant' | 'system' | 'user';
  children: ReactNode;
}) {
  const { meta = [], tone, children } = props;
  const wrapperClass = tone === 'user' ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[88%]';
  const surfaceClass =
    tone === 'user'
      ? 'border-sky-200 bg-sky-50 text-sky-950'
      : tone === 'system'
        ? 'border-slate-200 bg-slate-100/90 text-slate-700'
        : 'border-slate-200 bg-white text-slate-950';
  const speakerLabel =
    tone === 'user' ? 'You' : tone === 'system' ? 'System' : 'Assistant';

  return (
    <div className={wrapperClass}>
      <div className={`rounded-[28px] border px-5 py-4 shadow-sm ${surfaceClass}`}>
        <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.16em] text-inherit/60 uppercase">
          <span>{speakerLabel}</span>
          {meta.length > 0 ? <span className="text-inherit/40">•</span> : null}
          {meta.length > 0 ? (
            <div className="flex flex-wrap gap-2 text-[11px] font-normal tracking-normal text-inherit/55 normal-case">
              {meta.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function SidebarField(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div className="rounded-[20px] border border-slate-800 bg-slate-900/80 p-3">
      <div className="text-[11px] font-medium tracking-[0.16em] text-slate-400 uppercase">
        {label}
      </div>
      <div className="mt-1 break-words text-sm text-slate-100">{value}</div>
    </div>
  );
}
