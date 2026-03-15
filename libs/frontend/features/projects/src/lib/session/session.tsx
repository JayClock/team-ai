import { State } from '@hateoas-ts/resource';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { useAcpSession } from '@features/project-conversations';
import {
  AcpEventEnvelope,
  AcpSessionSummary,
  Codebase,
  Project,
  Root,
} from '@shared/schema';
import { toast } from '@shared/ui';
import {
  getCurrentDesktopRuntimeConfig,
  resolveRuntimeApiUrl,
} from '@shared/util-http';
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ProjectSessionConversationPane } from './project-session-conversation-pane';
import { ProjectSessionHistorySidebar } from './project-session-history-sidebar';
import { useProjectSessionChat } from './use-project-session-chat';
import {
  buildSessionTree,
} from './project-session-workbench.shared';
import {
  resolveWorkbenchSessionDefaults,
  type WorkbenchSessionRole,
  type WorkbenchSessionRuntimeProfile,
} from './session-runtime-profile';
import { useAcpProviders } from './use-acp-providers';
import { type ProjectRepositoryOption } from '../components/project-composer-input';

const STREAM_RETRY_DELAY_MS = 1500;
const LEFT_SIDEBAR_WIDTH_KEY = 'team-ai.session.left-sidebar-width';
const LEFT_SIDEBAR_COLLAPSED_KEY = 'team-ai.session.left-sidebar-collapsed';

export type ShellsSessionProps = {
  initialSessionId?: string;
  onPendingPromptConsumed?: () => void;
  onSessionNavigate?: (sessionId: string) => void;
  pendingPrompt?: string | null;
  projectState: State<Project>;
  projectTitle: string;
  runtimeProfile?: WorkbenchSessionRuntimeProfile | null;
};

function timestamp(value: string | null): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function ShellsSession(props: ShellsSessionProps) {
  const {
    projectState,
    initialSessionId,
    pendingPrompt,
    onPendingPromptConsumed,
    onSessionNavigate,
    projectTitle,
    runtimeProfile,
  } = props;
  const client = useClient();
  const meResource = useMemo(
    () => client.go<Root>('/api').follow('me'),
    [client],
  );
  const { data: me } = useSuspenseResource(meResource);
  const codebasesResource = useMemo(
    () => projectState.follow('codebases'),
    [projectState],
  );
  const { resourceState: codebasesState } =
    useSuspenseResource(codebasesResource);
  const {
    sessionsResource,
    selectedSession,
    history,
    create,
    select,
    prompt,
    ingestEvents,
  } = useAcpSession(projectState, {
    actorUserId: me.id,
    historyLimit: 200,
  });

  const [sessions, setSessions] = useState<State<AcpSessionSummary>[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<
    string | null
  >(null);
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(320);
  const [resizeMode, setResizeMode] = useState<'left' | null>(null);
  const [preferredRole, setPreferredRole] =
    useState<WorkbenchSessionRole | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const allowReconnectRef = useRef(true);
  const latestEventIdRef = useRef<string | undefined>(undefined);
  const initialSelectionAppliedRef = useRef<string | null>(null);
  const leftResizeStartRef = useRef({ width: 320, x: 0 });

  const selectedSessionId = selectedSession?.data.id;
  const sessionTree = useMemo(() => buildSessionTree(sessions), [sessions]);
  const repositoryOptions = useMemo(
    () =>
      codebasesState.collection.map<ProjectRepositoryOption>(
        (codebase: State<Codebase>) => ({
          id: codebase.data.id,
          isDefault: codebase.data.isDefault,
          repoPath: codebase.data.repoPath,
          sourceUrl: codebase.data.sourceUrl,
          title: codebase.data.title?.trim() || codebase.data.id,
        }),
      ),
    [codebasesState.collection],
  );
  const selectedRepository = useMemo(
    () =>
      repositoryOptions.find(
        (repository) => repository.id === selectedRepositoryId,
      ) ??
      repositoryOptions.find((repository) => repository.isDefault) ?? {
        id: projectState.data.id,
        repoPath: projectState.data.repoPath,
        sourceUrl: projectState.data.sourceUrl,
        title: projectTitle,
      },
    [
      projectState.data.id,
      projectState.data.repoPath,
      projectState.data.sourceUrl,
      projectTitle,
      repositoryOptions,
      selectedRepositoryId,
    ],
  );
  const sessionDefaults = useMemo(
    () =>
      resolveWorkbenchSessionDefaults({
        runtimeProfile,
        selectedSessionProvider: selectedSession?.data.provider ?? null,
        recentSessionProvider: sessions[0]?.data.provider ?? null,
      }),
    [runtimeProfile, selectedSession?.data.provider, sessions],
  );
  const {
    loading: providersLoading,
    providers,
    selectedProvider,
    selectedProviderId,
    setSelectedProviderId,
  } = useAcpProviders(sessionDefaults.providerId ?? 'opencode');

  useEffect(() => {
    if (
      selectedRepositoryId &&
      repositoryOptions.some((repository) => repository.id === selectedRepositoryId)
    ) {
      return;
    }

    const fallbackRepository =
      repositoryOptions.find((repository) => repository.isDefault) ??
      repositoryOptions[0];

    setSelectedRepositoryId(fallbackRepository?.id ?? null);
  }, [repositoryOptions, selectedRepositoryId]);

  useEffect(() => {
    if (!selectedSession?.data.cwd) {
      return;
    }

    const matched = repositoryOptions.find(
      (repository) => repository.repoPath === selectedSession.data.cwd,
    );
    if (matched) {
      setSelectedRepositoryId(matched.id);
    }
  }, [repositoryOptions, selectedSession?.data.cwd]);

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

    setIsLeftSidebarCollapsed(
      window.localStorage.getItem(LEFT_SIDEBAR_COLLAPSED_KEY) === 'true',
    );
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
      LEFT_SIDEBAR_COLLAPSED_KEY,
      String(isLeftSidebarCollapsed),
    );
  }, [isLeftSidebarCollapsed, leftSidebarWidth]);

  useEffect(() => {
    if (selectedSession) {
      setPreferredRole(
        selectedSession.data.specialistId === 'solo-developer'
          ? 'DEVELOPER'
          : 'ROUTA',
      );
      return;
    }

    setPreferredRole((current) => current ?? sessionDefaults.role);
  }, [selectedSession, sessionDefaults.role]);

  const creationRole = preferredRole ?? sessionDefaults.role;

  const createSessionWithDefaults = useCallback(
    async (input: { cwd?: string; goal?: string; provider?: string } = {}) => {
      const providerId =
        input.provider?.trim() || sessionDefaults.providerId?.trim();

      if (!providerId) {
        throw new Error(
          '当前项目还没有可用的默认 provider，请先在 Runtime Profile 中设置默认 provider，或复用已有会话。',
        );
      }

      return create({
        actorUserId: me.id,
        cwd: input.cwd?.trim() || undefined,
        provider: providerId,
        role: creationRole,
        goal: input.goal,
      });
    },
    [create, creationRole, me.id, sessionDefaults.providerId],
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

  const { chatMessages, handlePromptSubmit, hasPendingAssistantMessage } =
    useProjectSessionChat({
      history,
      selectedSession: selectedSession ?? undefined,
      pendingPrompt,
      onPendingPromptConsumed,
      createSession: (input) => createSessionWithDefaults(input),
      submitPrompt: async ({ sessionId, prompt: nextPrompt }) => {
        await prompt({
          session: sessionId,
          prompt: nextPrompt,
        });
      },
      refreshSessions: loadSessions,
    });
  const sessionPromptProviderPicker = selectedSession
    ? {
        disabled: true,
        loading: providersLoading,
        onValueChange: setSelectedProviderId,
        providers,
        value:
          selectedSession.data.provider ??
          selectedProviderId ??
          selectedProvider?.id,
      }
    : {
        loading: providersLoading,
        onValueChange: setSelectedProviderId,
        providers,
        value: selectedProviderId || selectedProvider?.id,
      };
  const sessionPromptProjectPicker = useMemo(
    () => {
      const sessionRepository =
        selectedSession?.data.cwd
          ? repositoryOptions.find(
              (repository) => repository.repoPath === selectedSession.data.cwd,
            ) ?? {
              id: selectedSession.data.cwd,
              repoPath: selectedSession.data.cwd,
              sourceUrl: null,
              title:
                selectedSession.data.cwd.split('/').at(-1) ??
                selectedSession.data.cwd,
            }
          : selectedRepository;

      return {
        cloneEndpoint: `/api/projects/${projectState.data.id}/codebases/clone`,
        disabled: selectedSession !== null,
        onProjectCloned: async (projectId: string) => {
          await codebasesResource.refresh();
          setSelectedRepositoryId(projectId);
        },
        onValueChange: (repository: ProjectRepositoryOption | null) =>
          setSelectedRepositoryId(repository?.id ?? null),
        projects:
          repositoryOptions.length > 0 ? repositoryOptions : [selectedRepository],
        value: sessionRepository,
      };
    },
    [
      projectState.data.id,
      codebasesResource,
      repositoryOptions,
      selectedRepository,
      selectedSession,
    ],
  );

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

  const startStream = useCallback(() => {
    if (!selectedSession) {
      return;
    }
    stopStream(false);
    allowReconnectRef.current = true;

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
      const delta = event.clientX - leftResizeStartRef.current.x;
      setLeftSidebarWidth(
        Math.min(Math.max(leftResizeStartRef.current.width + delta, 260), 420),
      );
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

  const handleSidebarSessionSelect = useCallback(
    (session: State<AcpSessionSummary>) => {
      void selectSessionFromList(session);
    },
    [selectSessionFromList],
  );

  const leftSidebar = (
    <ProjectSessionHistorySidebar
      onSelectSession={handleSidebarSessionSelect}
      projectTitle={projectTitle}
      selectedSessionId={selectedSessionId}
      sessions={sessionTree}
      sessionsLoading={sessionsLoading}
    />
  );

  return (
    <>
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-muted/20 text-foreground">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {!isLeftSidebarCollapsed ? (
            <>
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
            </>
          ) : null}

          <main className="min-w-0 flex-1 bg-background">
            <ProjectSessionConversationPane
              chatMessages={chatMessages}
              hasPendingAssistantMessage={hasPendingAssistantMessage}
              onSubmit={handlePromptSubmit}
              providerPicker={sessionPromptProviderPicker}
              projectPicker={sessionPromptProjectPicker}
              selectedSession={selectedSession}
            />
          </main>
        </div>
      </div>

      {resizeMode ? (
        <div className="fixed inset-0 z-40 cursor-col-resize" />
      ) : null}
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
