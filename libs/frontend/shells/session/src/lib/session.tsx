import { State } from '@hateoas-ts/resource';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { useAcpSession } from '@features/project-conversations';
import {
  AcpEventEnvelope,
  AcpSession,
  AcpSessionSummary,
  Project,
  Root,
  type Task,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Sheet,
  SheetContent,
  toast,
} from '@shared/ui';
import {
  getCurrentDesktopRuntimeConfig,
  resolveRuntimeApiUrl,
} from '@shared/util-http';
import {
  ChevronLeftIcon,
  FolderTreeIcon,
  PlusIcon,
  Rows3Icon,
  SparklesIcon,
} from 'lucide-react';
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ProjectSessionConversationPane } from './project-session-conversation-pane';
import { ProjectSessionHistorySidebar } from './project-session-history-sidebar';
import { ProjectSessionStatusSidebar } from './project-session-status-sidebar';
import { useProjectSessionChat } from './use-project-session-chat';
import {
  buildTaskRunPanelItem,
  buildTaskPanelItem,
  buildSessionTree,
  buildTaskSnapshot,
  formatStatusLabel,
  sessionDisplayName,
  statusChipClasses,
  statusTone,
  type TaskPanelAction,
  type TaskPanelItem,
} from './project-session-workbench.shared';
import {
  resolveWorkbenchProviderLabel,
  resolveWorkbenchSessionDefaults,
  type WorkbenchSessionRuntimeProfile,
} from './session-runtime-profile';

const STREAM_RETRY_DELAY_MS = 1500;
const TASK_POLL_INTERVAL_MS = 3000;
const LEFT_SIDEBAR_WIDTH_KEY = 'team-ai.session.left-sidebar-width';
const RIGHT_SIDEBAR_WIDTH_KEY = 'team-ai.session.right-sidebar-width';

type StreamStatus = 'idle' | 'connecting' | 'connected' | 'error';

export type ShellsSessionProps = {
  initialSessionId?: string;
  onBack?: () => void;
  onPendingPromptConsumed?: () => void;
  onSessionNavigate?: (sessionId: string) => void;
  pendingPrompt?: string | null;
  projectState: State<Project>;
  projectTitle: string;
  renderPromptInput?: (props: ShellsSessionPromptInputProps) => ReactNode;
  runtimeProfile?: WorkbenchSessionRuntimeProfile | null;
};

export type ShellsSessionPromptInputProps = {
  ariaLabel: string;
  disabled?: boolean;
  footerEnd?: ReactNode;
  footerStart?: ReactNode;
  onSubmit: (input: { files: unknown[]; text: string }) => Promise<void>;
  placeholder: string;
  submitDisabled?: boolean;
  submitPending?: boolean;
};

function timestamp(value: string | null): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatTaskActionSuccessMessage(
  item: TaskPanelItem,
  action: TaskPanelAction,
): string {
  if (action === 'retry') {
    return '已提交任务重试';
  }

  if (item.kind === 'verify') {
    return '已开始验证任务';
  }

  if (item.kind === 'review') {
    return '已开始复核任务';
  }

  return '已开始执行任务';
}

function formatTaskActionErrorMessage(action: TaskPanelAction): string {
  switch (action) {
    case 'retry':
      return '重试任务失败';
    case 'review':
      return '启动复核失败';
    case 'execute':
      return '启动任务失败';
  }
}

export function ShellsSession(props: ShellsSessionProps) {
  const {
    projectState,
    initialSessionId,
    onBack,
    pendingPrompt,
    onPendingPromptConsumed,
    onSessionNavigate,
    projectTitle,
    renderPromptInput,
    runtimeProfile,
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
    rename,
    deleteSession,
    ingestEvents,
  } = useAcpSession(projectState, {
    actorUserId: me.id,
    historyLimit: 200,
  });

  const [sessions, setSessions] = useState<State<AcpSessionSummary>[]>([]);
  const [sessionTaskItems, setSessionTaskItems] = useState<TaskPanelItem[]>([]);
  const [pendingTaskAction, setPendingTaskAction] = useState<{
    action: TaskPanelAction;
    taskId: string;
  } | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [isCreating, setIsCreating] = useState(false);
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<
    'activity' | 'checklist' | 'tasks' | null
  >(null);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(320);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(480);
  const [renameDialogSession, setRenameDialogSession] =
    useState<State<AcpSessionSummary> | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteDialogSession, setDeleteDialogSession] =
    useState<State<AcpSessionSummary> | null>(null);
  const [resizeMode, setResizeMode] = useState<'left' | 'right' | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const allowReconnectRef = useRef(true);
  const latestEventIdRef = useRef<string | undefined>(undefined);
  const initialSelectionAppliedRef = useRef<string | null>(null);
  const leftResizeStartRef = useRef({ width: 320, x: 0 });
  const rightResizeStartRef = useRef({ width: 360, x: 0 });

  const selectedSessionId = selectedSession?.data.id;
  const sideEvents = useMemo(
    () => history.filter((event) => event.type !== 'message'),
    [history],
  );
  const fallbackTaskItems = useMemo(
    () => buildTaskSnapshot(history),
    [history],
  );
  const taskItems = useMemo(
    () => (sessionTaskItems.length > 0 ? sessionTaskItems : fallbackTaskItems),
    [fallbackTaskItems, sessionTaskItems],
  );
  const sessionTree = useMemo(() => buildSessionTree(sessions), [sessions]);
  const showDesktopInspector = Boolean(selectedSession);
  const sessionDefaults = useMemo(
    () =>
      resolveWorkbenchSessionDefaults({
        runtimeProfile,
        selectedSessionProvider: selectedSession?.data.provider ?? null,
        recentSessionProvider: sessions[0]?.data.provider ?? null,
      }),
    [runtimeProfile, selectedSession?.data.provider, sessions],
  );
  const sessionProviderLabel = useMemo(
    () =>
      resolveWorkbenchProviderLabel(
        selectedSession?.data.provider ?? sessionDefaults.providerId,
      ),
    [selectedSession?.data.provider, sessionDefaults.providerId],
  );

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
      setLeftSidebarWidth(Math.min(Math.max(storedLeftWidth, 260), 420));
    }

    const storedRightWidth = Number.parseFloat(
      window.localStorage.getItem(RIGHT_SIDEBAR_WIDTH_KEY) ?? '',
    );
    if (Number.isFinite(storedRightWidth)) {
      setRightSidebarWidth(Math.min(Math.max(storedRightWidth, 280), 960));
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      LEFT_SIDEBAR_WIDTH_KEY,
      String(leftSidebarWidth),
    );
    window.localStorage.setItem(
      RIGHT_SIDEBAR_WIDTH_KEY,
      String(rightSidebarWidth),
    );
  }, [leftSidebarWidth, rightSidebarWidth]);

  const createSessionWithDefaults = useCallback(
    async (input: { goal?: string } = {}) => {
      if (!sessionDefaults.providerId) {
        throw new Error(
          '当前项目还没有可用的默认 provider，请先在 Runtime Profile 中设置默认 provider，或复用已有会话。',
        );
      }

      return create({
        actorUserId: me.id,
        provider: sessionDefaults.providerId,
        role: sessionDefaults.role,
        goal: input.goal,
      });
    },
    [create, me.id, sessionDefaults.providerId, sessionDefaults.role],
  );

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
          left.data.lastActivityAt ??
            left.data.startedAt ??
            left.data.completedAt,
        );
        const rightValue = timestamp(
          right.data.lastActivityAt ??
            right.data.startedAt ??
            right.data.completedAt,
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

  const loadTaskItems = useCallback(
    async (session: State<AcpSession>): Promise<TaskPanelItem[]> => {
      const itemsById = new Map<string, TaskPanelItem>();
      const taskStatesById = new Map<string, State<Task>>();
      const [linkedTask, firstPage] = await Promise.all([
        session.hasLink('task')
          ? session
              .follow('task')
              .get()
              .catch(() => null)
          : Promise.resolve(null),
        session.follow('tasks').refresh(),
      ]);

      const linkedTaskItem = linkedTask as
        | Parameters<typeof buildTaskPanelItem>[0]
        | null;

      if (linkedTaskItem) {
        taskStatesById.set(linkedTaskItem.data.id, linkedTaskItem);
        itemsById.set(
          linkedTaskItem.data.id,
          buildTaskPanelItem(linkedTaskItem),
        );
      }

      const appendPage = (page: typeof firstPage) => {
        for (const taskState of page.collection) {
          taskStatesById.set(taskState.data.id, taskState);
          itemsById.set(taskState.data.id, buildTaskPanelItem(taskState));
        }
      };

      appendPage(firstPage);

      let currentPage = firstPage;
      while (currentPage.hasLink('next')) {
        currentPage = await currentPage.follow('next').get();
        appendPage(currentPage);
      }

      const taskRunsByTaskId = await Promise.all(
        Array.from(taskStatesById.values()).map(async (taskState) => {
          let taskRunsPage = await taskState
            .follow('runs', { page: 1, pageSize: 50 })
            .refresh();
          const taskRuns = [...taskRunsPage.collection];

          while (taskRunsPage.hasLink('next')) {
            taskRunsPage = await taskRunsPage.follow('next').get();
            taskRuns.push(...taskRunsPage.collection);
          }

          const runItems = taskRuns
            .map((taskRun) => buildTaskRunPanelItem(taskRun))
            .sort((left, right) => {
              if (left.isLatest !== right.isLatest) {
                return left.isLatest ? -1 : 1;
              }

              const timeDelta =
                timestamp(
                  right.startedAt ?? right.createdAt ?? right.updatedAt,
                ) -
                timestamp(left.startedAt ?? left.createdAt ?? left.updatedAt);

              if (timeDelta !== 0) {
                return timeDelta;
              }

              return timestamp(right.updatedAt) - timestamp(left.updatedAt);
            });

          return [taskState.data.id, runItems] as const;
        }),
      );

      for (const [taskId, taskRuns] of taskRunsByTaskId) {
        const item = itemsById.get(taskId);
        if (!item) {
          continue;
        }

        itemsById.set(taskId, {
          ...item,
          taskRuns,
        });
      }

      return Array.from(itemsById.values());
    },
    [],
  );

  useEffect(() => {
    if (!selectedSession) {
      setSessionTaskItems([]);
      setTasksLoading(false);
      return;
    }

    let active = true;

    const syncTaskItems = async (notifyOnError: boolean) => {
      if (notifyOnError) {
        setTasksLoading(true);
      }

      try {
        const nextItems = await loadTaskItems(selectedSession);
        if (active) {
          setSessionTaskItems(nextItems);
        }
      } catch (error) {
        if (!notifyOnError || !active) {
          return;
        }
        const message = error instanceof Error ? error.message : '加载任务失败';
        toast.error(message);
      } finally {
        if (notifyOnError && active) {
          setTasksLoading(false);
        }
      }
    };

    void syncTaskItems(true);
    const intervalId = window.setInterval(() => {
      void syncTaskItems(false);
    }, TASK_POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [loadTaskItems, selectedSession]);

  const { chatMessages, handlePromptSubmit, hasPendingAssistantMessage } =
    useProjectSessionChat({
      history,
      selectedSession: selectedSession ?? undefined,
      pendingPrompt,
      onPendingPromptConsumed,
      createSession: () => createSessionWithDefaults(),
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
    async (session: State<AcpSessionSummary>, navigateToSession = true) => {
      try {
        await select({ session: session.data.id });
        if (navigateToSession) {
          onSessionNavigate?.(session.data.id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '选择会话失败';
        toast.error(message);
      }
    },
    [onSessionNavigate, select],
  );

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    try {
      const created = await createSessionWithDefaults();
      await loadSessions();
      onSessionNavigate?.(created.data.id);
      toast.success(`已创建会话 ${created.data.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建会话失败';
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [createSessionWithDefaults, loadSessions, onSessionNavigate]);

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
      const message = error instanceof Error ? error.message : '重命名会话失败';
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
      const message = error instanceof Error ? error.message : '删除会话失败';
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
    const target = sessions.find(
      (session) => session.data.id === initialSessionId,
    );
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
          Math.min(
            Math.max(leftResizeStartRef.current.width + delta, 260),
            420,
          ),
        );
        return;
      }

      if (resizeMode === 'right') {
        const delta = rightResizeStartRef.current.x - event.clientX;
        setRightSidebarWidth(
          Math.min(
            Math.max(rightResizeStartRef.current.width + delta, 280),
            960,
          ),
        );
      }
    };

    const handleMouseUp = () => {
      setResizeMode(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

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

  const handleSidebarSessionSelect = useCallback(
    (session: State<AcpSessionSummary>) => {
      setMobileSessionsOpen(false);
      void selectSessionFromList(session);
    },
    [selectSessionFromList],
  );

  const handleOpenTaskContext = useCallback(
    (session: State<AcpSessionSummary>) => {
      setInspectorTab('tasks');
      setMobileSessionsOpen(false);
      setMobileInspectorOpen(true);
      void selectSessionFromList(session);
    },
    [selectSessionFromList],
  );

  const handleOpenLinkedSession = useCallback(
    async (sessionId: string) => {
      try {
        setInspectorTab('tasks');
        await select({ session: sessionId });
        await loadSessions();
        setMobileInspectorOpen(false);
        onSessionNavigate?.(sessionId);
      } catch (error) {
        const message = error instanceof Error ? error.message : '打开会话失败';
        toast.error(message);
      }
    },
    [loadSessions, onSessionNavigate, select],
  );

  const handleTaskAction = useCallback(
    async (item: TaskPanelItem, action: TaskPanelAction) => {
      if (!item.taskState) {
        toast.error('当前任务还未同步完成，稍后再试');
        return;
      }

      setPendingTaskAction({ action, taskId: item.id });
      setTasksLoading(true);

      try {
        if (action === 'retry') {
          const latestRuns = await item.taskState
            .follow('runs', { page: 1, pageSize: 1 })
            .refresh();
          const latestRun = latestRuns.collection[0];

          if (!latestRun?.hasLink('retry-action')) {
            throw new Error('当前任务还没有可重试的最新执行记录');
          }

          await latestRun.follow('retry-action').post({});
        } else {
          if (!item.taskState.hasLink('execute')) {
            throw new Error('当前任务状态不支持直接启动');
          }

          await item.taskState.follow('execute').post({});
        }

        toast.success(formatTaskActionSuccessMessage(item, action));

        try {
          await loadSessions();
        } catch {
          // let polling reconcile session updates
        }

        if (selectedSession) {
          try {
            const nextItems = await loadTaskItems(selectedSession);
            setSessionTaskItems(nextItems);
          } catch {
            // let polling reconcile task updates
          }
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : formatTaskActionErrorMessage(action);
        toast.error(message);
      } finally {
        setPendingTaskAction(null);
        setTasksLoading(false);
      }
    },
    [loadSessions, loadTaskItems, selectedSession],
  );

  const leftSidebar = (
    <ProjectSessionHistorySidebar
      onDeleteSession={(session) => setDeleteDialogSession(session)}
      onOpenRename={openRenameDialog}
      onOpenTaskContext={handleOpenTaskContext}
      onSelectSession={handleSidebarSessionSelect}
      projectTitle={projectTitle}
      selectedSessionId={selectedSessionId}
      selectedSessionMeta={
        selectedSession
          ? {
              hierarchyLabel: selectedSession.data.parentSession
                ? selectedSession.data.task?.id
                  ? '任务子会话'
                  : '子会话'
                : '根会话',
              label: sessionDisplayName(selectedSession),
              provider:
                selectedSession.data.provider ?? sessionDefaults.providerId,
              specialistId: selectedSession.data.specialistId,
              state: selectedSession.data.state,
              taskId: selectedSession.data.task?.id ?? null,
            }
          : null
      }
      sessions={sessionTree}
      sessionsLoading={sessionsLoading}
    />
  );

  const inspector = (
    <ProjectSessionStatusSidebar
      activeTab={inspectorTab ?? undefined}
      events={sideEvents}
      onOpenSession={handleOpenLinkedSession}
      onTabChange={setInspectorTab}
      onTaskAction={handleTaskAction}
      pendingTaskAction={pendingTaskAction}
      providerFallbackLabel={sessionProviderLabel}
      selectedSession={selectedSession}
      streamStatus={streamStatus}
      taskItems={taskItems}
      tasksLoading={tasksLoading}
    />
  );

  return (
    <>
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-muted/20 text-foreground">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/95 px-3 md:px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setMobileSessionsOpen(true)}
          >
            <FolderTreeIcon className="size-4" />
            <span className="sr-only">打开会话列表</span>
          </Button>

          {onBack ? (
            <Button variant="ghost" size="icon-sm" onClick={onBack}>
              <ChevronLeftIcon />
              <span className="sr-only">返回项目</span>
            </Button>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <FolderTreeIcon className="size-3.5" />
              <span className="truncate">{projectTitle}</span>
              <span className="rounded-full border border-border/70 bg-background px-2 py-0.5">
                {sessionProviderLabel}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold md:text-base">
                {selectedSession ? sessionDisplayName(selectedSession) : '会话'}
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${statusChipClasses(streamStatus)}`}
              >
                <span
                  className={`size-1.5 rounded-full ${statusTone(streamStatus)}`}
                />
                <SparklesIcon className="size-3" />
                <span>{formatStatusLabel(streamStatus)}</span>
              </span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {showDesktopInspector ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2 px-3 lg:hidden"
                onClick={() => setMobileInspectorOpen(true)}
              >
                <Rows3Icon className="size-4" />
                面板
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 px-3"
              onClick={() => void handleCreate()}
              disabled={isCreating}
            >
              <PlusIcon className="size-4" />
              <span>{isCreating ? '创建中...' : '新建会话'}</span>
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside
            className="hidden shrink-0 border-r border-border/60 bg-background md:flex"
            style={{ width: leftSidebarWidth }}
          >
            {leftSidebar}
          </aside>

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

          <main className="min-w-0 flex-1 bg-background">
            <ProjectSessionConversationPane
              chatMessages={chatMessages}
              hasPendingAssistantMessage={hasPendingAssistantMessage}
              onSubmit={handlePromptSubmit}
              renderPromptInput={renderPromptInput}
              selectedSession={selectedSession}
            />
          </main>

          {showDesktopInspector ? (
            <div className="hidden lg:flex">
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
                className="flex shrink-0 border-l border-border/60 bg-background"
                style={{ width: rightSidebarWidth }}
              >
                {inspector}
              </aside>
            </div>
          ) : null}
        </div>
      </div>

      <Sheet open={mobileSessionsOpen} onOpenChange={setMobileSessionsOpen}>
        <SheetContent side="left" className="w-[360px] p-0 sm:max-w-[360px]">
          {leftSidebar}
        </SheetContent>
      </Sheet>

      <Sheet open={mobileInspectorOpen} onOpenChange={setMobileInspectorOpen}>
        <SheetContent side="right" className="w-[420px] p-0 sm:max-w-[420px]">
          {inspector}
        </SheetContent>
      </Sheet>

      {resizeMode ? (
        <div className="fixed inset-0 z-40 cursor-col-resize" />
      ) : null}

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
            <DialogDescription>请让标题与当前任务保持一致。</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            placeholder="输入会话标题"
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialogSession(null)}
            >
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

function ResizeHandle(props: {
  onMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const { onMouseDown } = props;

  return (
    <button
      type="button"
      className="group relative hidden w-2 shrink-0 cursor-col-resize items-center justify-center bg-transparent transition hover:bg-muted/60 md:flex"
      onMouseDown={onMouseDown}
      aria-label="调整面板宽度"
    >
      <span className="h-8 w-0.5 rounded-full bg-border transition group-hover:bg-foreground/30" />
    </button>
  );
}

export default ShellsSession;
