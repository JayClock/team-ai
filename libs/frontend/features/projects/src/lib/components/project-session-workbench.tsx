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
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  toast,
} from '@shared/ui';
import {
  getCurrentDesktopRuntimeConfig,
  resolveRuntimeApiUrl,
  runtimeFetch,
} from '@shared/util-http';
import {
  BookTextIcon,
  ChevronLeftIcon,
  FolderTreeIcon,
  GripVerticalIcon,
  PlusIcon,
  RadioTowerIcon,
  Rows3Icon,
  SparklesIcon,
  WorkflowIcon,
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
import { useProjectSessionChat } from './use-project-session-chat';
import { ProjectSessionConversationPane } from './project-session-conversation-pane';
import { ProjectSessionHistorySidebar } from './project-session-history-sidebar';
import { ProjectSessionStatusSidebar } from './project-session-status-sidebar';
import {
  buildSessionTree,
  buildTaskSnapshot,
  formatStatusLabel,
  sessionDisplayName,
  WorkbenchProjectInsights,
} from './project-session-workbench.shared';

const STREAM_RETRY_DELAY_MS = 1500;
const RIGHT_SIDEBAR_WIDTH_KEY = 'team-ai.session.right-sidebar-width';

type StreamStatus = 'idle' | 'connecting' | 'connected' | 'error';

type HalCollectionResponse<TEmbedded extends string, TItem> = {
  _embedded?: Record<TEmbedded, TItem[]>;
  total: number;
};

type RuntimeProfileResponse = {
  defaultModel: string | null;
  defaultProviderId: string | null;
  enabledMcpServerIds: string[];
  enabledSkillIds: string[];
  orchestrationMode: 'ROUTA' | 'DEVELOPER';
};

function timestamp(value: string | null): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function readRuntimeJson<T>(href: string): Promise<T> {
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
    provider: 'opencode',
    role: 'ROUTA',
    historyLimit: 200,
  });

  const [sessions, setSessions] = useState<State<AcpSessionSummary>[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const provider = 'opencode';
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [isCreating, setIsCreating] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(360);
  const [renameDialogSession, setRenameDialogSession] =
    useState<State<AcpSessionSummary> | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteDialogSession, setDeleteDialogSession] =
    useState<State<AcpSessionSummary> | null>(null);
  const [resizeMode, setResizeMode] = useState<'right' | null>(null);
  const [contextSummary, setContextSummary] =
    useState<WorkbenchProjectInsights>({
      loading: true,
      noteCount: 0,
      sessionNoteCount: 0,
      sessionTaskRunCount: 0,
      taskRunCount: 0,
      runtimeProfile: null,
    });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const allowReconnectRef = useRef(true);
  const latestEventIdRef = useRef<string | undefined>(undefined);
  const initialSelectionAppliedRef = useRef<string | null>(null);
  const rightResizeStartRef = useRef({ width: 360, x: 0 });

  const selectedSessionId = selectedSession?.data.id;
  const sideEvents = useMemo(
    () => history.filter((event) => event.type !== 'message'),
    [history],
  );
  const taskSnapshotItems = useMemo(
    () => buildTaskSnapshot(history),
    [history],
  );
  const sessionTree = useMemo(() => buildSessionTree(sessions), [sessions]);
  const showDesktopInspector = true;

  useEffect(() => {
    latestEventIdRef.current = history[history.length - 1]?.eventId;
  }, [history]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedRightWidth = Number.parseFloat(
      window.localStorage.getItem(RIGHT_SIDEBAR_WIDTH_KEY) ?? '',
    );
    if (Number.isFinite(storedRightWidth)) {
      setRightSidebarWidth(Math.min(Math.max(storedRightWidth, 300), 520));
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      RIGHT_SIDEBAR_WIDTH_KEY,
      String(rightSidebarWidth),
    );
  }, [rightSidebarWidth]);

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

  const loadContextSummary = useCallback(async () => {
    const projectId = projectState.data.id;
    setContextSummary((current) => ({
      ...current,
      loading: true,
    }));

    try {
      const projectNotesHref = `/api/projects/${projectId}/notes?page=1&pageSize=1`;
      const projectTaskRunsHref = `/api/projects/${projectId}/task-runs?page=1&pageSize=1`;
      const sessionNotesHref = selectedSessionId
        ? `/api/projects/${projectId}/acp-sessions/${selectedSessionId}/notes?page=1&pageSize=1`
        : null;
      const sessionTaskRunsHref = selectedSessionId
        ? `/api/projects/${projectId}/task-runs?page=1&pageSize=1&sessionId=${encodeURIComponent(selectedSessionId)}`
        : null;

      const [
        projectNotes,
        sessionNotes,
        projectTaskRuns,
        sessionTaskRuns,
        runtimeProfile,
      ] = await Promise.all([
        readRuntimeJson<HalCollectionResponse<'notes', unknown>>(
          projectNotesHref,
        ),
        sessionNotesHref
          ? readRuntimeJson<HalCollectionResponse<'notes', unknown>>(
              sessionNotesHref,
            )
          : Promise.resolve(null),
        readRuntimeJson<HalCollectionResponse<'taskRuns', unknown>>(
          projectTaskRunsHref,
        ),
        sessionTaskRunsHref
          ? readRuntimeJson<HalCollectionResponse<'taskRuns', unknown>>(
              sessionTaskRunsHref,
            )
          : Promise.resolve(null),
        readRuntimeJson<RuntimeProfileResponse>(
          `/api/projects/${projectId}/runtime-profile`,
        ),
      ]);

      setContextSummary({
        loading: false,
        noteCount: projectNotes.total,
        sessionNoteCount: sessionNotes?.total ?? 0,
        sessionTaskRunCount: sessionTaskRuns?.total ?? 0,
        taskRunCount: projectTaskRuns.total,
        runtimeProfile,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '加载控制面板数据失败';
      toast.error(message);
      setContextSummary({
        loading: false,
        noteCount: 0,
        sessionNoteCount: 0,
        sessionTaskRunCount: 0,
        taskRunCount: 0,
        runtimeProfile: null,
      });
    }
  }, [projectState.data.id, selectedSessionId]);

  useEffect(() => {
    void loadContextSummary();
  }, [loadContextSummary]);

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
          role: 'ROUTA',
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
      const created = await create({
        actorUserId: me.id,
        provider,
        role: 'ROUTA',
      });
      await loadSessions();
      onSessionNavigate?.(created.data.id);
      toast.success(`已创建会话 ${created.data.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建会话失败';
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [create, loadSessions, me.id, onSessionNavigate, provider]);

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
      if (resizeMode === 'right') {
        const delta = rightResizeStartRef.current.x - event.clientX;
        setRightSidebarWidth(
          Math.min(
            Math.max(rightResizeStartRef.current.width + delta, 300),
            520,
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

  const leftSidebar = (
    <ProjectSessionHistorySidebar
      contextSummary={contextSummary}
      onDeleteSession={(session) => setDeleteDialogSession(session)}
      onOpenRename={openRenameDialog}
      onSelectSession={(session) => void selectSessionFromList(session)}
      projectTitle={projectTitle}
      selectedSessionId={selectedSessionId}
      selectedSessionMeta={
        selectedSession
          ? {
              label: sessionDisplayName(selectedSession),
              provider: selectedSession.data.provider,
              state: selectedSession.data.state,
            }
          : null
      }
      sessions={sessionTree}
      sessionsLoading={sessionsLoading}
    />
  );

  const inspector = (
    <ProjectSessionStatusSidebar
      contextSummary={contextSummary}
      events={sideEvents}
      roleById={new Map()}
      selectedSession={selectedSession}
      selectedTask={null}
      specialistById={new Map()}
      taskSnapshotItems={taskSnapshotItems}
      onOpenTask={() => undefined}
    />
  );

  return (
    <>
      <SidebarProvider defaultOpen>
        <div className="flex h-full min-h-0 w-full overflow-hidden bg-[#f6f7fb] text-foreground dark:bg-[#0b0d12]">
          {leftSidebar}

          <SidebarInset className="min-h-0 overflow-hidden border border-border/60 bg-background/95 md:rounded-l-none md:shadow-none">
            <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border/70 px-4 md:px-5">
              <SidebarTrigger className="size-8" />

              {onBack ? (
                <Button variant="ghost" size="icon-sm" onClick={onBack}>
                  <ChevronLeftIcon />
                  <span className="sr-only">返回项目</span>
                </Button>
              ) : null}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FolderTreeIcon className="size-3.5" />
                  <span className="truncate">{projectTitle}</span>
                  <span className="rounded-full border border-border/70 bg-background px-2 py-0.5 font-medium">
                    {selectedSession?.data.provider ?? 'opencode'}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-semibold md:text-base">
                    {selectedSession
                      ? sessionDisplayName(selectedSession)
                      : '会话'}
                  </h2>
                  <StatusPill
                    icon={<SparklesIcon className="size-3.5" />}
                    label={formatStatusLabel(streamStatus)}
                  />
                  <StatusPill
                    icon={<BookTextIcon className="size-3.5" />}
                    label={`Notes ${contextSummary.sessionNoteCount}/${contextSummary.noteCount}`}
                  />
                  <StatusPill
                    icon={<RadioTowerIcon className="size-3.5" />}
                    label={`Runs ${contextSummary.sessionTaskRunCount}/${contextSummary.taskRunCount}`}
                  />
                  <StatusPill
                    icon={<WorkflowIcon className="size-3.5" />}
                    label={
                      contextSummary.runtimeProfile?.orchestrationMode ??
                      'ROUTA'
                    }
                  />
                </div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2 px-3 lg:hidden"
                  onClick={() => setMobileInspectorOpen(true)}
                >
                  <Rows3Icon className="size-4" />
                  面板
                </Button>
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

            <div className="flex min-h-0 flex-1 overflow-hidden bg-muted/20">
              <main className="flex min-w-0 flex-1 flex-col p-3 md:p-4">
                <div className="flex min-h-0 flex-1 overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-sm">
                  <ProjectSessionConversationPane
                    chatMessages={chatMessages}
                    hasPendingAssistantMessage={hasPendingAssistantMessage}
                    onSubmit={handlePromptSubmit}
                    selectedSession={selectedSession}
                  />
                </div>
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
                    className="flex shrink-0 border-l border-border/70 bg-background/90"
                    style={{ width: rightSidebarWidth }}
                  >
                    {inspector}
                  </aside>
                </div>
              ) : null}
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>

      <Sheet open={mobileInspectorOpen} onOpenChange={setMobileInspectorOpen}>
        <SheetContent side="right" className="w-[420px] p-0 sm:max-w-[420px]">
          {inspector}
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

function StatusPill(props: { icon: ReactNode; label: string }) {
  const { icon, label } = props;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-xs">
      {icon}
      <span>{label}</span>
    </span>
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
