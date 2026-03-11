import { State } from '@hateoas-ts/resource';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { useAcpSession } from '@features/project-conversations';
import {
  AcpEventEnvelope,
  AcpSession,
  AcpSessionSummary,
  Project,
  Root,
  type AcpCompleteEventData,
  type AcpErrorEventData,
  type AcpPlanEventData,
  type AcpSessionEventData,
  type AcpToolCallEventData,
  type AcpToolResultEventData,
} from '@shared/schema';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
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
  Sheet,
  SheetContent,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@shared/ui';
import {
  getCurrentDesktopRuntimeConfig,
  resolveRuntimeApiUrl,
} from '@shared/util-http';
import {
  BotIcon,
  ChevronLeftIcon,
  Clock3Icon,
  FolderTreeIcon,
  GripVerticalIcon,
  ListChecksIcon,
  MenuIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  SquareTerminalIcon,
  Trash2Icon,
  WrenchIcon,
} from 'lucide-react';
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useProjectSessionChat } from './use-project-session-chat';

const STREAM_RETRY_DELAY_MS = 1500;
const LEFT_SIDEBAR_WIDTH_KEY = 'team-ai.session.left-sidebar-width';
const RIGHT_SIDEBAR_WIDTH_KEY = 'team-ai.session.right-sidebar-width';
const LEFT_SIDEBAR_COLLAPSED_KEY = 'team-ai.session.left-sidebar-collapsed';
const LEFT_SIDEBAR_RATIO_KEY = 'team-ai.session.left-sidebar-ratio';

type StreamStatus = 'idle' | 'connecting' | 'connected' | 'error';

type TaskSnapshotItem = {
  description?: string;
  id: string;
  source: 'plan' | 'tool';
  status: string;
  title: string;
};

type SessionTreeNode = {
  children: SessionTreeNode[];
  session: State<AcpSessionSummary>;
};

type SidebarTab = 'sessions' | 'spec' | 'tasks';

function sessionDisplayName(
  session: State<AcpSessionSummary> | State<AcpSession>,
): string {
  const name = session.data.name?.trim();
  if (name) {
    return name;
  }
  return `会话 ${session.data.id}`;
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
    return '无';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function eventLabel(event: AcpEventEnvelope): string {
  switch (event.type) {
    case 'tool_call':
      return '工具调用';
    case 'tool_result':
      return '工具结果';
    case 'session':
      return '会话';
    case 'plan':
      return '计划';
    case 'usage':
      return '上下文用量';
    case 'mode':
      return '模式';
    case 'config':
      return '配置';
    case 'complete':
      return '完成';
    case 'error':
      return '错误';
    case 'status':
      return '状态';
    case 'message':
      return '消息';
  }
}

function formatStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'COMPLETED':
    case 'completed':
      return '已完成';
    case 'RUNNING':
    case 'running':
      return '进行中';
    case 'in_progress':
      return '处理中';
    case 'FAILED':
    case 'failed':
      return '失败';
    case 'CANCELLED':
    case 'cancelled':
      return '已取消';
    case 'connected':
      return '已连接';
    case 'connecting':
      return '连接中';
    case 'idle':
      return '空闲';
    case 'error':
    case 'error-stream':
      return '错误';
    default:
      return status?.trim() || '无';
  }
}

function formatPriorityLabel(priority: string | null | undefined): string {
  switch (priority?.toLowerCase()) {
    case 'high':
      return '高优先级';
    case 'medium':
      return '中优先级';
    case 'low':
      return '低优先级';
    default:
      return priority?.trim() || '未标注';
  }
}

function eventHeadline(event: AcpEventEnvelope): string {
  switch (event.type) {
    case 'tool_call':
      return event.data.title ?? event.data.toolName ?? '工具调用';
    case 'tool_result':
      return event.data.title ?? event.data.toolName ?? '工具结果';
    case 'plan':
      return `共 ${event.data.entries.length} 项计划`;
    case 'usage':
      return `${event.data.used}/${event.data.size} 上下文令牌`;
    case 'session':
      return (
        event.data.reason ??
        event.data.title ??
        formatStatusLabel(event.data.state) ??
        '会话'
      );
    case 'mode':
      return event.data.currentModeId;
    case 'config':
      return `共 ${event.data.configOptions.length} 个配置项`;
    case 'complete':
      return event.data.stopReason ?? event.data.reason ?? '已完成';
    case 'error':
      return event.error?.message ?? event.data.message ?? '发生错误';
    case 'status':
      return event.data.reason ?? formatStatusLabel(event.data.state) ?? '状态更新';
    case 'message':
      return event.data.role ?? '消息';
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
        return `会话状态已变更为${formatStatusLabel(data.state)}。`;
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

function latestPlanEntries(history: AcpEventEnvelope[]) {
  const plans = history.filter((event) => event.type === 'plan') as Array<
    AcpEventEnvelope & { type: 'plan'; data: AcpPlanEventData }
  >;
  return plans.at(-1)?.data.entries ?? [];
}

function buildTaskSnapshot(history: AcpEventEnvelope[]): TaskSnapshotItem[] {
  const planItems = latestPlanEntries(history).map((entry, index) => ({
    id: `plan-${index}-${entry.content}`,
    title: entry.content,
    status: entry.status,
    description: formatPriorityLabel(entry.priority),
    source: 'plan' as const,
  }));

  const toolMap = new Map<string, TaskSnapshotItem>();
  for (const event of history) {
    if (event.type !== 'tool_call' && event.type !== 'tool_result') {
      continue;
    }

    const data =
      event.type === 'tool_call'
        ? (event.data as AcpToolCallEventData)
        : (event.data as AcpToolResultEventData);
    const key =
      data.toolCallId ??
      `${event.type}:${data.title ?? data.toolName ?? event.eventId}`;
    const title = data.title ?? data.toolName ?? '工具';
    const fallbackStatus = event.type === 'tool_result' ? 'completed' : 'in_progress';
    const description =
      data.locations && data.locations.length > 0
        ? data.locations
            .slice(0, 2)
            .map((location) =>
              location.line ? `${location.path}:${location.line}` : location.path,
            )
            .join(' · ')
        : undefined;

    toolMap.set(key, {
      id: key,
      title,
      status: data.status ?? fallbackStatus,
      description,
      source: 'tool',
    });
  }

  if (planItems.length > 0) {
    return planItems;
  }

  return Array.from(toolMap.values());
}

function buildSessionTree(
  sessions: State<AcpSessionSummary>[],
): SessionTreeNode[] {
  const childMap = new Map<string, State<AcpSessionSummary>[]>();
  const roots: State<AcpSessionSummary>[] = [];
  const allIds = new Set(sessions.map((session) => session.data.id));

  for (const session of sessions) {
    const parentId = session.data.parentSession?.id;
    if (!parentId || !allIds.has(parentId)) {
      roots.push(session);
      continue;
    }
    const children = childMap.get(parentId) ?? [];
    children.push(session);
    childMap.set(parentId, children);
  }

  const sortSessions = (items: State<AcpSessionSummary>[]) =>
    [...items].sort((left, right) => {
      const leftValue = timestamp(
        left.data.lastActivityAt ?? left.data.startedAt ?? left.data.completedAt,
      );
      const rightValue = timestamp(
        right.data.lastActivityAt ?? right.data.startedAt ?? right.data.completedAt,
      );
      return rightValue - leftValue;
    });

  const hydrate = (session: State<AcpSessionSummary>): SessionTreeNode => ({
    session,
    children: sortSessions(childMap.get(session.data.id) ?? []).map(hydrate),
  });

  return sortSessions(roots).map(hydrate);
}

function statusTone(status: string): string {
  switch (status) {
    case 'completed':
    case 'COMPLETED':
    case 'connected':
      return 'bg-emerald-500';
    case 'running':
    case 'RUNNING':
    case 'in_progress':
    case 'connecting':
      return 'bg-amber-500';
    case 'FAILED':
    case 'failed':
    case 'error':
    case 'CANCELLED':
    case 'cancelled':
      return 'bg-rose-500';
    default:
      return 'bg-slate-400';
  }
}

function statusChipClasses(status: string): string {
  switch (status) {
    case 'COMPLETED':
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'RUNNING':
    case 'running':
    case 'in_progress':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    case 'FAILED':
    case 'failed':
    case 'error':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 'CANCELLED':
    case 'cancelled':
      return 'bg-slate-100 text-slate-600 ring-slate-200';
    case 'connected':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'connecting':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    case 'idle':
      return 'bg-slate-100 text-slate-600 ring-slate-200';
    case 'error-stream':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-200';
  }
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
      <div className="mt-3 space-y-2">
        {primaryValue !== undefined ? (
          <pre className="overflow-x-auto rounded-xl border bg-muted/60 p-3 text-xs">
            {typeof primaryValue === 'string' ? primaryValue : formatJson(primaryValue)}
          </pre>
        ) : null}
        {data.locations && data.locations.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {data.locations.map((location, index) => (
              <span
                key={`${location.path}-${index}`}
                className="rounded-full border bg-background px-2 py-1"
              >
                {location.path}
                {location.line ? `:${location.line}` : ''}
              </span>
            ))}
          </div>
        ) : null}
        {rawPayload ? (
          <details className="rounded-xl border bg-muted/30 p-3">
            <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-muted-foreground">
              原始载荷
            </summary>
            <pre className="mt-2 overflow-x-auto text-xs">{formatJson(rawPayload)}</pre>
          </details>
        ) : null}
      </div>
    );
  }

  if (event.type === 'plan') {
    return (
      <div className="mt-3 space-y-2">
        {event.data.entries.map((entry, index) => (
          <div
            key={`${event.eventId}-${index}`}
            className="rounded-xl border bg-muted/40 p-3"
          >
            <div className="text-sm font-medium">{entry.content}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatPriorityLabel(entry.priority)} · {formatStatusLabel(entry.status)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const summary = summarizeSessionEvent(event);
  if (summary) {
    return <p className="mt-3 text-sm leading-6">{summary}</p>;
  }

  if (rawPayload) {
    return (
      <pre className="mt-3 overflow-x-auto rounded-xl border bg-muted/60 p-3 text-xs">
        {formatJson(rawPayload)}
      </pre>
    );
  }

  return null;
}

export function ProjectSessionsWorkspace(props: {
  initialSessionId?: string;
  onBack?: () => void;
  onPendingPromptConsumed?: () => void;
  onSessionNavigate?: (sessionId: string) => void;
  pendingPrompt?: string | null;
  projectState: State<Project>;
  projectTitle: string;
}) {
  const {
    projectState,
    initialSessionId,
    onBack,
    pendingPrompt,
    onPendingPromptConsumed,
    onSessionNavigate,
    projectTitle,
  } = props;
  const client = useClient();
  const meResource = useMemo(() => client.go<Root>('/api').follow('me'), [client]);
  const { data: me } = useSuspenseResource(meResource);
  const {
    sessionsResource,
    selectedSession,
    history,
    create,
    select,
    prompt,
    rename,
    deleteSession,
    ingestEvents,
  } = useAcpSession(projectState, {
    actorUserId: me.id,
    provider: 'codex',
    mode: 'CHAT',
    historyLimit: 200,
  });

  const [sessions, setSessions] = useState<State<AcpSessionSummary>[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const provider = 'codex';
  const mode = 'CHAT';
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>('sessions');
  const [, setStreamStatus] = useState<StreamStatus>('idle');
  const [isCreating, setIsCreating] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(320);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(360);
  const [leftSidebarRatio, setLeftSidebarRatio] = useState(0.58);
  const [renameDialogSession, setRenameDialogSession] =
    useState<State<AcpSessionSummary> | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteDialogSession, setDeleteDialogSession] =
    useState<State<AcpSessionSummary> | null>(null);
  const [resizeMode, setResizeMode] = useState<'left' | 'right' | 'split' | null>(
    null,
  );

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const allowReconnectRef = useRef(true);
  const latestEventIdRef = useRef<string | undefined>(undefined);
  const initialSelectionAppliedRef = useRef<string | null>(null);
  const sessionsSplitRef = useRef<HTMLDivElement | null>(null);
  const leftResizeStartRef = useRef({ width: 320, x: 0 });
  const rightResizeStartRef = useRef({ width: 360, x: 0 });

  const selectedSessionId = selectedSession?.data.id;
  const sideEvents = useMemo(
    () => history.filter((event) => event.type !== 'message'),
    [history],
  );
  const taskItems = useMemo(() => buildTaskSnapshot(history), [history]);
  const sessionTree = useMemo(() => buildSessionTree(sessions), [sessions]);
  const quickAccessVisible = taskItems.length > 0;
  const showInspector = taskItems.length > 0 || sideEvents.length > 0;

  useEffect(() => {
    latestEventIdRef.current = history[history.length - 1]?.eventId;
  }, [history]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedLeftWidth = Number.parseFloat(
      window.localStorage.getItem(LEFT_SIDEBAR_WIDTH_KEY) ?? '',
    );
    if (Number.isFinite(storedLeftWidth)) {
      setLeftSidebarWidth(Math.min(Math.max(storedLeftWidth, 260), 440));
    }

    const storedRightWidth = Number.parseFloat(
      window.localStorage.getItem(RIGHT_SIDEBAR_WIDTH_KEY) ?? '',
    );
    if (Number.isFinite(storedRightWidth)) {
      setRightSidebarWidth(Math.min(Math.max(storedRightWidth, 300), 520));
    }

    const storedRatio = Number.parseFloat(
      window.localStorage.getItem(LEFT_SIDEBAR_RATIO_KEY) ?? '',
    );
    if (Number.isFinite(storedRatio)) {
      setLeftSidebarRatio(Math.min(Math.max(storedRatio, 0.3), 0.78));
    }

    setLeftSidebarCollapsed(
      window.localStorage.getItem(LEFT_SIDEBAR_COLLAPSED_KEY) === '1',
    );
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(LEFT_SIDEBAR_WIDTH_KEY, String(leftSidebarWidth));
  }, [leftSidebarWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(RIGHT_SIDEBAR_WIDTH_KEY, String(rightSidebarWidth));
  }, [rightSidebarWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(LEFT_SIDEBAR_RATIO_KEY, String(leftSidebarRatio));
  }, [leftSidebarRatio]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      LEFT_SIDEBAR_COLLAPSED_KEY,
      leftSidebarCollapsed ? '1' : '0',
    );
  }, [leftSidebarCollapsed]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      let currentPage = await sessionsResource.refresh();
      const allSessions = [...currentPage.collection];
      while (currentPage.hasLink('next')) {
        currentPage = await currentPage.follow('next').get();
        allSessions.push(...currentPage.collection);
      }
      allSessions.sort((left, right) => {
        const leftValue = timestamp(
          left.data.lastActivityAt ?? left.data.startedAt ?? left.data.completedAt,
        );
        const rightValue = timestamp(
          right.data.lastActivityAt ?? right.data.startedAt ?? right.data.completedAt,
        );
        return rightValue - leftValue;
      });
      setSessions(allSessions);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '加载会话列表失败';
      toast.error(message);
    } finally {
      setSessionsLoading(false);
    }
  }, [sessionsResource]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const { chatMessages, handlePromptSubmit, hasPendingAssistantMessage } =
    useProjectSessionChat({
      history,
      selectedSession: selectedSession ?? undefined,
      pendingPrompt,
      onPendingPromptConsumed,
      createSession: () =>
        create({
          actorUserId: me.id,
          provider,
          mode,
        }),
      submitPrompt: async ({ sessionId, prompt: nextPrompt }) => {
        await prompt({
          session: sessionId,
          prompt: nextPrompt,
        });
      },
      refreshSessions: loadSessions,
    });

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
        // ignore non-json payloads
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
        setMobileSidebarOpen(false);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '选择会话失败';
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
      setMobileSidebarOpen(false);
      toast.success(`已创建会话 ${created.data.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '创建会话失败';
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [create, loadSessions, me.id, mode, onSessionNavigate, provider]);

  const submitRename = useCallback(async () => {
    const session = renameDialogSession;
    if (!session) {
      return;
    }
    const nextName = renameValue.trim();
    if (!nextName) {
      toast.error('会话名称不能为空');
      return;
    }
    try {
      await rename({
        session: session.data.id,
        name: nextName,
      });
      await loadSessions();
      setRenameDialogSession(null);
      toast.success('会话已重命名');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '重命名会话失败';
      toast.error(message);
    }
  }, [loadSessions, rename, renameDialogSession, renameValue]);

  const confirmDelete = useCallback(async () => {
    const session = deleteDialogSession;
    if (!session) {
      return;
    }
    try {
      await deleteSession({
        session: session.data.id,
      });
      await loadSessions();
      setDeleteDialogSession(null);
      toast.success('会话已删除');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '删除会话失败';
      toast.error(message);
    }
  }, [deleteDialogSession, deleteSession, loadSessions]);

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
    if (!resizeMode) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (resizeMode === 'left') {
        const delta = event.clientX - leftResizeStartRef.current.x;
        setLeftSidebarWidth(
          Math.min(Math.max(leftResizeStartRef.current.width + delta, 260), 440),
        );
        return;
      }

      if (resizeMode === 'right') {
        const delta = rightResizeStartRef.current.x - event.clientX;
        setRightSidebarWidth(
          Math.min(Math.max(rightResizeStartRef.current.width + delta, 300), 520),
        );
        return;
      }

      const container = sessionsSplitRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const nextRatio = (event.clientY - rect.top) / rect.height;
      setLeftSidebarRatio(Math.min(Math.max(nextRatio, 0.3), 0.78));
    };

    const handleMouseUp = () => {
      setResizeMode(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor =
      resizeMode === 'split' ? 'row-resize' : 'col-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [resizeMode]);

  const openRenameDialog = useCallback((session: State<AcpSessionSummary>) => {
    setRenameDialogSession(session);
    setRenameValue(session.data.name ?? sessionDisplayName(session));
  }, []);

  const leftSidebar = (
    <SessionSidebarContent
      activeTab={activeSidebarTab}
      leftSidebarRatio={leftSidebarRatio}
      onCollapse={() => setLeftSidebarCollapsed(true)}
      onDeleteSession={(session) => setDeleteDialogSession(session)}
      onOpenRename={openRenameDialog}
      onSelectSession={(session) => void selectSessionFromList(session)}
      onStartSplitResize={() => {
        setResizeMode('split');
      }}
      onTabChange={setActiveSidebarTab}
      projectTitle={projectTitle}
      quickAccessVisible={quickAccessVisible}
      selectedSessionId={selectedSessionId}
      sessions={sessionTree}
      sessionsLoading={sessionsLoading}
      sessionsSplitRef={sessionsSplitRef}
      taskItems={taskItems}
    />
  );

  const inspector = (
    <WorkbenchSidebarContent
      events={sideEvents}
      selectedSession={selectedSession}
      taskItems={taskItems}
    />
  );

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <MenuIcon />
            <span className="sr-only">打开会话侧栏</span>
          </Button>

          {onBack ? (
            <Button variant="ghost" size="icon-sm" onClick={onBack}>
              <ChevronLeftIcon />
              <span className="sr-only">返回项目首页</span>
            </Button>
          ) : null}

          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FolderTreeIcon className="size-3.5" />
              <span className="truncate">{projectTitle}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold md:text-base">
                {selectedSession
                  ? sessionDisplayName(selectedSession)
                  : '会话'}
              </h2>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 px-3"
              onClick={() => void handleCreate()}
              disabled={isCreating}
            >
              <PlusIcon />
              <span>{isCreating ? '创建中...' : '新建会话'}</span>
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="hidden md:flex">
            {leftSidebarCollapsed ? (
              <aside className="flex w-11 shrink-0 flex-col items-center gap-1.5 border-r bg-muted/30 py-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setLeftSidebarCollapsed(false)}
                >
                  <PanelLeftOpenIcon />
                  <span className="sr-only">展开侧栏</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={activeSidebarTab === 'sessions' ? 'bg-primary/10 text-primary' : undefined}
                  onClick={() => {
                    setActiveSidebarTab('sessions');
                    setLeftSidebarCollapsed(false);
                  }}
                >
                  <MessageSquareTextIcon />
                  <span className="sr-only">会话标签</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={activeSidebarTab === 'spec' ? 'bg-primary/10 text-primary' : undefined}
                  onClick={() => {
                    setActiveSidebarTab('spec');
                    setLeftSidebarCollapsed(false);
                  }}
                >
                  <FolderTreeIcon />
                  <span className="sr-only">规格标签</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={activeSidebarTab === 'tasks' ? 'bg-primary/10 text-primary' : undefined}
                  onClick={() => {
                    setActiveSidebarTab('tasks');
                    setLeftSidebarCollapsed(false);
                  }}
                >
                  <ListChecksIcon />
                  <span className="sr-only">任务标签</span>
                </Button>
              </aside>
            ) : (
              <aside
                className="flex shrink-0 border-r bg-muted/20"
                style={{ width: leftSidebarWidth }}
              >
                <div className="flex min-w-0 flex-1 flex-col">{leftSidebar}</div>
                <ResizeHandle
                  onMouseDown={(event) => {
                    event.preventDefault();
                    leftResizeStartRef.current = {
                      width: leftSidebarWidth,
                      x: event.clientX,
                    };
                    setResizeMode('left');
                  }}
                />
              </aside>
            )}
          </div>

          <main className="flex min-w-0 flex-1 flex-col">
            <section className="flex min-h-0 flex-1 flex-col">
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <Conversation className="min-h-0 flex-1">
                  <ConversationContent className="gap-4 px-4 py-5 md:px-6">
                    {chatMessages.length === 0 ? (
                      <ConversationEmptyState
                        icon={<BotIcon className="size-10 text-muted-foreground/60" />}
                        title="暂无对话"
                        description="选择一个会话，或者直接发送第一条消息。"
                      />
                    ) : (
                      <>
                        {chatMessages.map((message) => {
                          const isSystem = message.role === 'system';
                          const isThought = message.parts.every(
                            (part) => part.type === 'reasoning',
                          );
                          const hasReasoning = message.parts.some(
                            (part) => part.type === 'reasoning',
                          );
                          const isPending = message.metadata?.pending === true;

                          return (
                          <Message
                            key={message.id}
                            from={message.role === 'user' ? 'user' : 'assistant'}
                            className={
                              isSystem
                                ? 'mx-auto max-w-2xl'
                                : isThought
                                  ? 'opacity-85'
                                  : undefined
                            }
                          >
                            <MessageContent
                              className={
                                isSystem
                                  ? 'mx-auto rounded-full border bg-muted/50 px-3 py-2 text-xs text-muted-foreground'
                                  : isThought
                                    ? 'rounded-2xl border border-dashed border-border/70 bg-muted/40 px-4 py-3'
                                    : undefined
                              }
                            >
                              {isThought ? (
                                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                                  <SparklesIcon className="size-3.5" />
                                  <span>助手推理</span>
                                </div>
                              ) : null}
                              {message.parts.map((part, index) => {
                                if (part.type === 'reasoning') {
                                  return (
                                    <div
                                      key={`${message.id}-${index}`}
                                      className={
                                        hasReasoning && !isThought
                                          ? 'mb-3 rounded-2xl border border-dashed border-border/70 bg-muted/40 px-4 py-3'
                                          : undefined
                                      }
                                    >
                                      {!isThought ? (
                                        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                                          <SparklesIcon className="size-3.5" />
                                          <span>助手推理</span>
                                        </div>
                                      ) : null}
                                      <MessageResponse>{part.text}</MessageResponse>
                                    </div>
                                  );
                                }

                                if (part.type === 'text') {
                                  if (isPending) {
                                    return (
                                      <div
                                        key={`${message.id}-${index}`}
                                        className="flex items-center gap-2 text-sm text-muted-foreground"
                                      >
                                        <Spinner className="size-4" />
                                        正在等待响应...
                                      </div>
                                    );
                                  }
                                  return (
                                    <MessageResponse key={`${message.id}-${index}`}>
                                      {part.text}
                                    </MessageResponse>
                                  );
                                }

                                return null;
                              })}
                              <div className="mt-2 text-[11px] text-muted-foreground">
                                {formatDateTime(message.metadata?.emittedAt ?? null)}
                              </div>
                            </MessageContent>
                          </Message>
                          );
                        })}
                      </>
                    )}
                  </ConversationContent>
                  <ConversationScrollButton />
                </Conversation>

                <div className="shrink-0 border-t bg-background/95 p-4 backdrop-blur md:px-6">
                  <PromptInput onSubmit={handlePromptSubmit}>
                    <PromptInputBody className="rounded-2xl border border-input bg-background shadow-sm transition-all duration-200 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                      <PromptInputTextarea
                        placeholder={
                          selectedSession
                            ? '继续当前会话...'
                            : '发送第一条消息，开始新的会话...'
                        }
                        className="min-h-24 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                        disabled={hasPendingAssistantMessage}
                        aria-label="会话输入框"
                      />
                    </PromptInputBody>
                    <PromptInputFooter className="mt-2 flex items-center justify-between gap-3">
                      <PromptInputTools>
                        <div className="text-xs text-muted-foreground">
                          {selectedSession
                            ? formatStatusLabel(selectedSession.data.state)
                            : '发送后将创建新会话'}
                        </div>
                      </PromptInputTools>
                      <PromptInputSubmit
                        status={hasPendingAssistantMessage ? 'submitted' : undefined}
                      />
                    </PromptInputFooter>
                  </PromptInput>
                </div>
              </div>
            </section>
          </main>

          {showInspector ? (
            <div className="hidden md:flex">
              <ResizeHandle
                onMouseDown={(event) => {
                  event.preventDefault();
                  rightResizeStartRef.current = {
                    width: rightSidebarWidth,
                    x: event.clientX,
                  };
                  setResizeMode('right');
                }}
              />
              <aside
                className="flex shrink-0 border-l bg-muted/20"
                style={{ width: rightSidebarWidth }}
              >
                {inspector}
              </aside>
            </div>
          ) : null}
        </div>
      </div>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-[360px] p-0 sm:max-w-[360px]">
          {leftSidebar}
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(renameDialogSession)}
        onOpenChange={(open) => {
          if (!open) {
            setRenameDialogSession(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
            <DialogDescription>
              请让标题与当前任务保持一致。
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            placeholder="输入会话标题"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogSession(null)}>
              取消
            </Button>
            <Button onClick={() => void submitRename()}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteDialogSession)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDialogSession(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除会话</AlertDialogTitle>
            <AlertDialogDescription>
              删除后当前会话记录将无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SessionSidebarContent(props: {
  activeTab: SidebarTab;
  leftSidebarRatio: number;
  onCollapse: () => void;
  onDeleteSession: (session: State<AcpSessionSummary>) => void;
  onOpenRename: (session: State<AcpSessionSummary>) => void;
  onSelectSession: (session: State<AcpSessionSummary>) => void;
  onStartSplitResize: () => void;
  onTabChange: (value: SidebarTab) => void;
  projectTitle: string;
  quickAccessVisible: boolean;
  selectedSessionId?: string;
  sessions: SessionTreeNode[];
  sessionsLoading: boolean;
  sessionsSplitRef: React.RefObject<HTMLDivElement | null>;
  taskItems: TaskSnapshotItem[];
}) {
  const {
    activeTab,
    leftSidebarRatio,
    onCollapse,
    onDeleteSession,
    onOpenRename,
    onSelectSession,
    onStartSplitResize,
    onTabChange,
    projectTitle,
    quickAccessVisible,
    selectedSessionId,
    sessions,
    sessionsLoading,
    sessionsSplitRef,
    taskItems,
  } = props;
  const totalSessions = useMemo(
    () =>
      sessions.reduce(
        (count, node) => count + countSessionTree(node),
        0,
      ),
    [sessions],
  );
  const runningCount = taskItems.filter((item) =>
    ['RUNNING', 'running', 'in_progress'].includes(item.status),
  ).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FolderTreeIcon className="size-3.5 shrink-0 text-primary" />
          <span className="truncate text-xs text-muted-foreground">{projectTitle}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onCollapse}>
            <PanelLeftCloseIcon />
            <span className="sr-only">收起侧栏</span>
          </Button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => onTabChange(value as SidebarTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b px-2 py-1.5">
          <TabsList className="grid h-auto w-full grid-cols-3 rounded-none bg-transparent p-0">
            <TabsTrigger
              value="sessions"
              className="gap-1.5 rounded-none border-b-2 border-transparent px-2 py-2 text-[11px] font-medium shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <MessageSquareTextIcon className="size-3.5" />
              会话
            </TabsTrigger>
            <TabsTrigger
              value="spec"
              className="gap-1.5 rounded-none border-b-2 border-transparent px-2 py-2 text-[11px] font-medium shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <FolderTreeIcon className="size-3.5" />
              规格
            </TabsTrigger>
            <TabsTrigger
              value="tasks"
              className="gap-1.5 rounded-none border-b-2 border-transparent px-2 py-2 text-[11px] font-medium shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <ListChecksIcon className="size-3.5" />
              任务
              {taskItems.length > 0 ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    runningCount > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {taskItems.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sessions" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="border-b px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              会话
            </p>
            <p className="mt-1 text-sm font-medium">共 {totalSessions} 个会话</p>
          </div>

          <div ref={sessionsSplitRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              className="min-h-0 overflow-hidden"
              style={
                quickAccessVisible ? { flexBasis: `${leftSidebarRatio * 100}%` } : undefined
              }
            >
              <ScrollArea className="h-full">
                <div className="space-y-2 p-3">
                  {sessionsLoading ? (
                    <p className="text-sm text-muted-foreground">正在加载会话...</p>
                  ) : sessions.length === 0 ? (
                    <Empty className="border-dashed px-4 py-10">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <MessageSquareTextIcon className="size-5" />
                        </EmptyMedia>
                        <EmptyTitle>还没有会话</EmptyTitle>
                        <EmptyDescription>
                          点击顶部“新建会话”开始第一个会话。
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    sessions.map((node) => (
                      <SessionTreeItem
                        key={node.session.data.id}
                        node={node}
                        selectedSessionId={selectedSessionId}
                        onDelete={onDeleteSession}
                        onOpenRename={onOpenRename}
                        onSelect={onSelectSession}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            {quickAccessVisible ? (
              <>
                <button
                  type="button"
                  className="hidden h-2 shrink-0 cursor-row-resize items-center justify-center border-y bg-muted/50 transition hover:bg-muted md:flex"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onStartSplitResize();
                  }}
                  data-testid="session-sidebar-split-handle"
                >
                  <div className="h-1 w-10 rounded-full bg-border" />
                </button>
                <div
                  className="min-h-52 shrink-0 border-t bg-background/80"
                  style={{ flexBasis: `${(1 - leftSidebarRatio) * 100}%` }}
                >
                  <QuickAccessPanel
                    taskItems={taskItems}
                    onOpenTasks={() => onTabChange('tasks')}
                  />
                </div>
              </>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="spec" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <SpecSidebarContent />
        </TabsContent>

        <TabsContent value="tasks" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <TasksSidebarContent taskItems={taskItems} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SpecSidebarContent() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          规格
        </p>
        <p className="mt-1 text-sm font-medium">规格内容</p>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <div className="w-full rounded-2xl border border-dashed bg-muted/30 px-4 py-10 text-center">
          <p className="text-sm font-medium">暂无规格内容</p>
        </div>
      </div>
    </div>
  );
}

function TasksSidebarContent(props: { taskItems: TaskSnapshotItem[] }) {
  const { taskItems } = props;
  const runningCount = taskItems.filter((item) =>
    ['RUNNING', 'running', 'in_progress'].includes(item.status),
  ).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          任务
        </p>
        <p className="mt-1 text-sm font-medium">
          {taskItems.length > 0 ? `共 ${taskItems.length} 项，${runningCount} 项进行中` : '暂无任务'}
        </p>
      </div>

      <ScrollArea className="h-full">
        <div className="space-y-2 p-3">
          {taskItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              还没有任务或计划项。
            </div>
          ) : (
            taskItems.map((item) => (
              <div key={item.id} className="rounded-2xl border bg-background px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`size-2 shrink-0 rounded-full ${statusTone(item.status)}`} />
                      <span className="truncate text-sm font-medium">{item.title}</span>
                    </div>
                    {item.description ? (
                      <p className="mt-2 text-xs text-muted-foreground">{item.description}</p>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${statusChipClasses(item.status)}`}
                  >
                    {formatStatusLabel(item.status)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function WorkbenchSidebarContent(props: {
  events: AcpEventEnvelope[];
  selectedSession: State<AcpSession> | null;
  taskItems: TaskSnapshotItem[];
}) {
  const { events, selectedSession, taskItems } = props;
  const recentEvents = events.slice(-10).reverse();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              工作台
            </p>
            <p className="mt-1 text-sm font-medium">
              {taskItems.length > 0 ? '任务面板' : '运行记录'}
            </p>
          </div>
          {taskItems.length > 0 ? (
            <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              {taskItems.length} 项
            </span>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 space-y-4 p-4">
        {taskItems.length > 0 ? (
          <section className="rounded-2xl border bg-background p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ListChecksIcon className="size-4 text-muted-foreground" />
              任务概览
            </div>
            <div className="mt-3 space-y-2">
              {taskItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border bg-muted/20 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-2 shrink-0 rounded-full ${statusTone(item.status)}`}
                        />
                        <div className="truncate text-sm font-medium">
                          {item.title}
                        </div>
                      </div>
                      {item.description ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${statusChipClasses(item.status)}`}
                    >
                      {formatStatusLabel(item.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border bg-background p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock3Icon className="size-4 text-muted-foreground" />
            会话信息
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <MetadataRow
              label="标题"
              value={
                selectedSession
                  ? sessionDisplayName(selectedSession)
                  : '未选择会话'
              }
            />
            <MetadataRow
              label="状态"
              value={formatStatusLabel(selectedSession?.data.state)}
            />
            <MetadataRow
              label="最近活跃"
              value={
                selectedSession?.data.lastActivityAt
                  ? formatDateTime(selectedSession.data.lastActivityAt)
                  : '无'
              }
            />
          </div>
        </section>
      </div>

      <div className="min-h-0 flex-1 px-4 pb-4">
        <section className="flex h-full min-h-0 flex-col rounded-2xl border bg-background">
          <div className="shrink-0 border-b px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <SquareTerminalIcon className="size-4 text-muted-foreground" />
              运行记录
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-4">
              {recentEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">还没有运行记录。</p>
              ) : (
                recentEvents.map((event) => (
                  <div
                    key={event.eventId}
                    className="rounded-2xl border bg-muted/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {event.type === 'tool_call' || event.type === 'tool_result' ? (
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
                    {taskItems.length === 0 ? renderEventDetails(event) : null}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </section>
      </div>
    </div>
  );
}

function SessionTreeItem(props: {
  node: SessionTreeNode;
  onDelete: (session: State<AcpSessionSummary>) => void;
  onOpenRename: (session: State<AcpSessionSummary>) => void;
  onSelect: (session: State<AcpSessionSummary>) => void;
  selectedSessionId?: string;
  depth?: number;
}) {
  const {
    node,
    onDelete,
    onOpenRename,
    onSelect,
    selectedSessionId,
    depth = 0,
  } = props;
  const active = node.session.data.id === selectedSessionId;

  return (
    <div className="space-y-2">
      <div
        className={`rounded-2xl border transition ${
          active ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-background'
        }`}
        style={{ marginLeft: depth * 14 }}
      >
        <div className="flex items-start gap-2 px-3 py-3">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => onSelect(node.session)}
          >
            <div className="flex min-w-0 items-center gap-2">
              <MessageSquareTextIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-medium">
                {sessionDisplayName(node.session)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>{formatStatusLabel(node.session.data.state)}</span>
              <span>{node.session.data.provider}</span>
              <span>{formatDateTime(node.session.data.lastActivityAt)}</span>
            </div>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontalIcon />
                <span className="sr-only">会话操作</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOpenRename(node.session)}>
                <PencilIcon />
                重命名
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(node.session)}
              >
                <Trash2Icon />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {node.children.length > 0 ? (
        <div className="space-y-2">
          {node.children.map((child) => (
            <SessionTreeItem
              key={child.session.data.id}
              node={child}
              depth={depth + 1}
              selectedSessionId={selectedSessionId}
              onDelete={onDelete}
              onOpenRename={onOpenRename}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function QuickAccessPanel(props: {
  taskItems: TaskSnapshotItem[];
  onOpenTasks: () => void;
}) {
  const { taskItems, onOpenTasks } = props;
  const runningCount = taskItems.filter((item) =>
    ['RUNNING', 'running', 'in_progress'].includes(item.status),
  ).length;
  const completedCount = taskItems.filter((item) =>
    ['COMPLETED', 'completed'].includes(item.status),
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b bg-muted/40 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              快速访问
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {`${taskItems.length} 个任务项${runningCount > 0 ? `，${runningCount} 个进行中` : ''}`}
            </p>
          </div>
          <Button variant="secondary" size="sm" className="h-7 px-2 text-[10px]" onClick={onOpenTasks}>
            打开任务
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              任务快照
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              共 {taskItems.length} 项
            </span>
            {runningCount > 0 ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                {runningCount} 个进行中
              </span>
            ) : null}
            {completedCount > 0 ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                {completedCount} 个已完成
              </span>
            ) : null}
          </div>
        </div>

        <ScrollArea className="h-[calc(100%-3.5rem)]">
          <div className="space-y-2 px-3 pb-3" data-testid="session-task-snapshot">
            {taskItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                还没有任务或计划项。
              </div>
            ) : (
              taskItems.map((item) => (
                <div
                  key={item.id}
                  data-testid="session-task-snapshot-item"
                  className="flex items-center gap-3 rounded-2xl border bg-background px-3 py-3"
                >
                  <span className={`size-2 shrink-0 rounded-full ${statusTone(item.status)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{item.title}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {formatStatusLabel(item.status)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function MetadataRow(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[220px] text-right font-medium">{value}</span>
    </div>
  );
}

function ResizeHandle(props: {
  onMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const { onMouseDown } = props;

  return (
    <button
      type="button"
      className="group relative hidden w-3 shrink-0 cursor-col-resize items-center justify-center bg-transparent transition hover:bg-muted md:flex"
      onMouseDown={onMouseDown}
      aria-label="调整面板宽度"
    >
      <GripVerticalIcon className="size-4 text-muted-foreground/50 group-hover:text-muted-foreground" />
    </button>
  );
}

function countSessionTree(node: SessionTreeNode): number {
  return 1 + node.children.reduce((count, child) => count + countSessionTree(child), 0);
}
