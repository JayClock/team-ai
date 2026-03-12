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
  GripVerticalIcon,
  ListChecksIcon,
  MenuIcon,
  MessageSquareTextIcon,
  PanelLeftOpenIcon,
  PlusIcon,
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
import { ProjectSessionConversationPane } from './project-session-conversation-pane';
import { ProjectSessionHistorySidebar } from './project-session-history-sidebar';
import { ProjectSessionStatusSidebar } from './project-session-status-sidebar';
import {
  buildSessionTree,
  buildTaskSnapshot,
  sessionDisplayName,
  SidebarTab,
} from './project-session-workbench.shared';

const STREAM_RETRY_DELAY_MS = 1500;
const LEFT_SIDEBAR_WIDTH_KEY = 'team-ai.session.left-sidebar-width';
const RIGHT_SIDEBAR_WIDTH_KEY = 'team-ai.session.right-sidebar-width';
const LEFT_SIDEBAR_COLLAPSED_KEY = 'team-ai.session.left-sidebar-collapsed';
const LEFT_SIDEBAR_RATIO_KEY = 'team-ai.session.left-sidebar-ratio';

type StreamStatus = 'idle' | 'connecting' | 'connected' | 'error';

function timestamp(value: string | null): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function ProjectSessionWorkbench(props: {
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
    role: 'DEVELOPER',
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
          role: 'DEVELOPER',
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
        role: 'DEVELOPER',
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
    <ProjectSessionHistorySidebar
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
    <ProjectSessionStatusSidebar
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
              <span className="sr-only">返回项目</span>
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
            <ProjectSessionConversationPane
              chatMessages={chatMessages}
              hasPendingAssistantMessage={hasPendingAssistantMessage}
              onSubmit={handlePromptSubmit}
              selectedSession={selectedSession}
            />
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
