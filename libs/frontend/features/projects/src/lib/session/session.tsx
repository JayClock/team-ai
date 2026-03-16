import { State } from '@hateoas-ts/resource';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { useAcpSession } from '@features/project-conversations';
import {
  AcpEventEnvelope,
  AcpSessionSummary,
  Codebase,
  Note,
  NoteEvent,
  NoteCollection,
  Project,
  Root,
  Task,
  TaskCollection,
  TaskRun,
  TaskRunCollection,
  Worktree,
} from '@shared/schema';
import { Button, toast } from '@shared/ui';
import {
  getCurrentDesktopRuntimeConfig,
  resolveRuntimeApiUrl,
  runtimeFetch,
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
import { ProjectSessionSpecPane } from './project-session-spec-pane';
import { ProjectSessionStatusSidebar } from './project-session-status-sidebar';
import { useProjectSessionChat } from './use-project-session-chat';
import {
  buildSessionTree,
  buildTaskPanelItem,
  buildTaskRunPanelItem,
  type SpecSyncSnapshot,
  type TaskPanelAction,
  type TaskPanelItem,
} from './project-session-workbench.shared';
import {
  resolveComposerModel,
  shouldResetComposerModelOnProviderChange,
} from './session-composer-model';
import {
  resolveWorkbenchSessionDefaults,
  type WorkbenchSessionRole,
  type WorkbenchSessionRuntimeProfile,
} from './session-runtime-profile';
import { useAcpProviders } from './use-acp-providers';
import { useAcpProviderModels } from './use-acp-provider-models';
import {
  type ProjectRepositoryOption,
  type ProjectWorktreeOption,
} from '../components/project-composer-input';
import { ProjectRuntimeProfilePanel } from '../components/project-runtime-profile-panel';
import type { ProjectModelPickerProps } from '../components/project-model-picker';

const STREAM_RETRY_DELAY_MS = 1500;
const LEFT_SIDEBAR_WIDTH_KEY = 'team-ai.session.left-sidebar-width';
const LEFT_SIDEBAR_COLLAPSED_KEY = 'team-ai.session.left-sidebar-collapsed';

type StreamStatus = 'idle' | 'connecting' | 'connected' | 'error';
type MainPane = 'conversation' | 'spec' | 'ops';

function buildCollectionPath(
  path: string,
  query: Record<string, string | number | null | undefined>,
): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    searchParams.set(key, String(value));
  }

  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}

async function loadTaskCollectionPages(
  initialPage: State<TaskCollection>,
): Promise<State<Task>[]> {
  const items = [...initialPage.collection];
  let currentPage = initialPage;

  while (currentPage.hasLink('next' as never)) {
    currentPage = await currentPage.follow('next' as never).get();
    items.push(...currentPage.collection);
  }

  return items;
}

async function loadTaskRunCollectionPages(
  initialPage: State<TaskRunCollection>,
): Promise<State<TaskRun>[]> {
  const items = [...initialPage.collection];
  let currentPage = initialPage;

  while (currentPage.hasLink('next' as never)) {
    currentPage = await currentPage.follow('next' as never).get();
    items.push(...currentPage.collection);
  }

  return items;
}

async function loadNoteCollectionPages(
  initialPage: State<NoteCollection>,
): Promise<State<Note>[]> {
  const items = [...initialPage.collection];
  let currentPage = initialPage;

  while (currentPage.hasLink('next' as never)) {
    currentPage = await currentPage.follow('next' as never).get();
    items.push(...currentPage.collection);
  }

  return items;
}

function resolveRootSessionId(
  sessions: State<AcpSessionSummary>[],
  sessionId: string | undefined,
): string | undefined {
  if (!sessionId) {
    return undefined;
  }

  const parentById = new Map(
    sessions.map((session) => [
      session.data.id,
      session.data.parentSession?.id ?? null,
    ]),
  );
  const visited = new Set<string>();
  let currentId: string | null | undefined = sessionId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const parentId = parentById.get(currentId);
    if (!parentId) {
      return currentId;
    }
    currentId = parentId;
  }

  return sessionId;
}

function createSessionAnnotationMap(
  taskItems: TaskPanelItem[],
): Record<string, string[]> {
  const annotationMap = new Map<string, Set<string>>();

  const addAnnotation = (
    sessionId: string | null | undefined,
    label: string,
  ) => {
    if (!sessionId) {
      return;
    }

    const current = annotationMap.get(sessionId) ?? new Set<string>();
    current.add(label);
    annotationMap.set(sessionId, current);
  };

  for (const item of taskItems) {
    if (item.source !== 'task') {
      continue;
    }

    if (item.executionSessionId) {
      addAnnotation(item.executionSessionId, `执行 ${item.taskId ?? item.id}`);
    }

    if (item.resultSessionId) {
      addAnnotation(item.resultSessionId, `回写 ${item.taskId ?? item.id}`);
    }
  }

  return Object.fromEntries(
    [...annotationMap.entries()].map(([sessionId, labels]) => [
      sessionId,
      [...labels].slice(0, 3),
    ]),
  );
}

export type ShellsSessionProps = {
  initialSessionId?: string;
  onPendingPromptConsumed?: () => void;
  onRuntimeProfileChange?: (
    profile: WorkbenchSessionRuntimeProfile | null,
  ) => void;
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

function mapWorktreeOptions(items: State<Worktree>[]): ProjectWorktreeOption[] {
  return items.map((worktree) => ({
    id: worktree.data.id,
    codebaseId: worktree.data.codebaseId,
    branch: worktree.data.branch,
    baseBranch: worktree.data.baseBranch,
    status: worktree.data.status,
    worktreePath: worktree.data.worktreePath,
    sessionId: worktree.data.sessionId,
    label: worktree.data.label,
    errorMessage: worktree.data.errorMessage,
  }));
}

export function ShellsSession(props: ShellsSessionProps) {
  const {
    projectState,
    initialSessionId,
    onRuntimeProfileChange,
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
  const [worktrees, setWorktrees] = useState<ProjectWorktreeOption[]>([]);
  const [worktreesLoading, setWorktreesLoading] = useState(false);
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(320);
  const [resizeMode, setResizeMode] = useState<'left' | null>(null);
  const [preferredRole, setPreferredRole] =
    useState<WorkbenchSessionRole | null>(null);
  const [preferredModelOverride, setPreferredModelOverride] = useState<
    string | null | undefined
  >(undefined);
  const [preferredProviderOverride, setPreferredProviderOverride] = useState<
    string | null | undefined
  >(undefined);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [mainPane, setMainPane] = useState<MainPane>('conversation');
  const [taskItems, setTaskItems] = useState<TaskPanelItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [pendingTaskAction, setPendingTaskAction] = useState<{
    action: TaskPanelAction;
    taskId: string;
  } | null>(null);
  const [specNote, setSpecNote] = useState<State<Note> | null>(null);
  const [specSyncSnapshot, setSpecSyncSnapshot] =
    useState<SpecSyncSnapshot | null>(null);
  const [specLoading, setSpecLoading] = useState(false);
  const [specSyncLoading, setSpecSyncLoading] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const noteEventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const noteReconnectTimerRef = useRef<number | null>(null);
  const allowReconnectRef = useRef(true);
  const allowNoteReconnectRef = useRef(true);
  const latestEventIdRef = useRef<string | undefined>(undefined);
  const latestNoteEventIdRef = useRef<string | undefined>(undefined);
  const initialSelectionAppliedRef = useRef<string | null>(null);
  const leftResizeStartRef = useRef({ width: 320, x: 0 });

  const selectedSessionId = selectedSession?.data.id;
  const sessionTree = useMemo(() => buildSessionTree(sessions), [sessions]);
  const workbenchSessionId = useMemo(
    () =>
      resolveRootSessionId(sessions, selectedSessionId) ??
      selectedSessionId ??
      undefined,
    [selectedSessionId, sessions],
  );
  const workbenchSessionSummary = useMemo(
    () =>
      sessions.find((session) => session.data.id === workbenchSessionId) ??
      null,
    [sessions, workbenchSessionId],
  );
  const scopeSessionLabel = useMemo(() => {
    const name = workbenchSessionSummary?.data.name?.trim();
    if (name) {
      return name;
    }
    return workbenchSessionSummary?.data.id ?? null;
  }, [workbenchSessionSummary]);
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
  const selectedCodebaseState = useMemo(() => {
    const activeCodebaseId =
      selectedSession?.data.codebase?.id ?? selectedRepository.id;

    return (
      codebasesState.collection.find(
        (codebase) => codebase.data.id === activeCodebaseId,
      ) ?? null
    );
  }, [
    codebasesState.collection,
    selectedRepository.id,
    selectedSession?.data.codebase?.id,
  ]);
  const selectedWorktree = useMemo(
    () =>
      worktrees.find(
        (worktree) => worktree.id === selectedSession?.data.worktree?.id,
      ) ?? null,
    [selectedSession?.data.worktree?.id, worktrees],
  );
  const sessionAnnotationsById = useMemo(
    () => createSessionAnnotationMap(taskItems),
    [taskItems],
  );
  const sessionDefaults = useMemo(
    () =>
      resolveWorkbenchSessionDefaults({
        runtimeProfile,
      }),
    [runtimeProfile],
  );
  const {
    loading: providersLoading,
    providers,
    selectedProviderId,
  } = useAcpProviders(sessionDefaults.providerId);
  const composerProviderId =
    selectedSession?.data.provider ?? selectedProviderId ?? null;
  const {
    error: providerModelsError,
    loading: providerModelsLoading,
    models: providerModels,
  } = useAcpProviderModels(composerProviderId);

  useEffect(() => {
    if (
      selectedRepositoryId &&
      repositoryOptions.some(
        (repository) => repository.id === selectedRepositoryId,
      )
    ) {
      return;
    }

    const fallbackRepository =
      repositoryOptions.find((repository) => repository.isDefault) ??
      repositoryOptions[0];

    setSelectedRepositoryId(fallbackRepository?.id ?? null);
  }, [repositoryOptions, selectedRepositoryId]);

  useEffect(() => {
    if (selectedSession?.data.codebase?.id) {
      setSelectedRepositoryId(selectedSession.data.codebase.id);
      return;
    }

    if (!selectedSession?.data.cwd) {
      return;
    }

    const matched = repositoryOptions.find(
      (repository) => repository.repoPath === selectedSession.data.cwd,
    );
    if (matched) {
      setSelectedRepositoryId(matched.id);
    }
  }, [
    repositoryOptions,
    selectedSession?.data.codebase?.id,
    selectedSession?.data.cwd,
  ]);

  useEffect(() => {
    let active = true;

    if (!selectedCodebaseState?.hasLink('worktrees')) {
      setWorktrees([]);
      setWorktreesLoading(false);
      return;
    }

    setWorktreesLoading(true);

    void selectedCodebaseState
      .follow('worktrees')
      .refresh()
      .then((worktreesState) => {
        if (!active) {
          return;
        }

        setWorktrees(mapWorktreeOptions(worktreesState.collection));
      })
      .catch(() => {
        if (active) {
          setWorktrees([]);
        }
      })
      .finally(() => {
        if (active) {
          setWorktreesLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedCodebaseState]);

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

  const lastComposerProviderIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedSession) {
      lastComposerProviderIdRef.current = composerProviderId;
      return;
    }

    if (
      shouldResetComposerModelOnProviderChange({
        previousProviderId: lastComposerProviderIdRef.current,
        nextProviderId: composerProviderId,
      })
    ) {
      setPreferredModelOverride(null);
    }

    lastComposerProviderIdRef.current = composerProviderId;
  }, [composerProviderId, selectedSession]);

  const creationRole = preferredRole ?? sessionDefaults.role;
  const creationModel = resolveComposerModel({
    modelOverride: preferredModelOverride,
    sessionDefaultModel: sessionDefaults.model,
  });

  const createSessionWithDefaults = useCallback(
    async (
      input: {
        cwd?: string;
        goal?: string;
        model?: string | null;
        provider?: string | null;
      } = {},
    ) => {
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
        model: input.model?.trim() || creationModel,
        provider: providerId,
        role: creationRole,
        goal: input.goal,
      });
    },
    [create, creationModel, creationRole, me.id, sessionDefaults.providerId],
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

  const refreshTaskItems = useCallback(async () => {
    if (!workbenchSessionId) {
      setTaskItems([]);
      setTasksLoading(false);
      return;
    }

    setTasksLoading(true);

    try {
      const taskListPath = buildCollectionPath(
        `/api/projects/${projectState.data.id}/tasks`,
        {
          pageSize: 100,
          sessionId: workbenchSessionId,
        },
      );
      const taskPage = await client.go<TaskCollection>(taskListPath).get();
      const taskStates = await loadTaskCollectionPages(taskPage);
      const taskRunStatesByTask = await Promise.all(
        taskStates.map(async (taskState) => {
          const runsPage = await taskState.follow('runs').get();
          const runStates = await loadTaskRunCollectionPages(runsPage);

          return [...runStates].sort((left, right) => {
            const leftValue = timestamp(
              left.data.startedAt ??
                left.data.completedAt ??
                left.data.updatedAt ??
                left.data.createdAt,
            );
            const rightValue = timestamp(
              right.data.startedAt ??
                right.data.completedAt ??
                right.data.updatedAt ??
                right.data.createdAt,
            );
            return rightValue - leftValue;
          });
        }),
      );

      const nextItems = taskStates
        .map((taskState, index) => ({
          ...buildTaskPanelItem(taskState),
          taskRuns: taskRunStatesByTask[index].map(buildTaskRunPanelItem),
        }))
        .sort((left, right) => {
          const leftIndex = left.sourceEntryIndex ?? Number.MAX_SAFE_INTEGER;
          const rightIndex = right.sourceEntryIndex ?? Number.MAX_SAFE_INTEGER;

          if (leftIndex !== rightIndex) {
            return leftIndex - rightIndex;
          }

          return left.title.localeCompare(right.title, 'zh-CN');
        });

      setTaskItems(nextItems);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '加载任务工作区失败';
      toast.error(message);
      setTaskItems([]);
    } finally {
      setTasksLoading(false);
    }
  }, [client, projectState.data.id, workbenchSessionId]);

  const refreshSpecPane = useCallback(async () => {
    if (!workbenchSessionId) {
      setSpecLoading(false);
      setSpecNote(null);
      setSpecSyncSnapshot(null);
      return;
    }

    setSpecLoading(true);

    try {
      const sessionNotesPath = buildCollectionPath(
        `/api/projects/${projectState.data.id}/acp-sessions/${workbenchSessionId}/notes`,
        {
          pageSize: 1,
          type: 'spec',
        },
      );
      const sessionNotesPage = await client
        .go<NoteCollection>(sessionNotesPath)
        .get();
      const sessionSpecNote =
        (await loadNoteCollectionPages(sessionNotesPage))[0] ?? null;

      const projectNotesPage = sessionSpecNote
        ? null
        : await client
            .go<NoteCollection>(
              buildCollectionPath(
                `/api/projects/${projectState.data.id}/notes`,
                {
                  pageSize: 1,
                  type: 'spec',
                },
              ),
            )
            .get();

      const projectSpecNote =
        projectNotesPage &&
        (await loadNoteCollectionPages(projectNotesPage))[0];

      const resolvedNote = sessionSpecNote ?? projectSpecNote ?? null;
      setSpecNote(resolvedNote);

      if (!resolvedNote) {
        setSpecSyncSnapshot(null);
        return;
      }

      const response = await runtimeFetch(
        `/api/notes/${resolvedNote.data.id}/spec-task-sync`,
      );
      const payload = (await response.json()) as SpecSyncSnapshot;

      if (!response.ok) {
        throw new Error('加载 Spec 同步状态失败');
      }

      setSpecSyncSnapshot(payload);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '加载 Spec 工作区失败';
      toast.error(message);
      setSpecNote(null);
      setSpecSyncSnapshot(null);
    } finally {
      setSpecLoading(false);
    }
  }, [client, projectState.data.id, workbenchSessionId]);

  useEffect(() => {
    void refreshTaskItems();
    void refreshSpecPane();
  }, [refreshSpecPane, refreshTaskItems]);

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
  const sessionPromptProviderPicker = {
    loading: providersLoading,
    onValueChange: setPreferredProviderOverride,
    providers,
    value:
      preferredProviderOverride !== undefined
        ? preferredProviderOverride
        : selectedSession
          ? selectedSession.data.provider
          : selectedProviderId,
  };
  const sessionPromptModelPicker: ProjectModelPickerProps = {
    error: providerModelsError,
    loading: providerModelsLoading,
    models: providerModels,
    onValueChange: setPreferredModelOverride,
    providerId: composerProviderId,
    value:
      preferredModelOverride !== undefined
        ? preferredModelOverride
        : selectedSession
          ? selectedSession.data.model
          : creationModel,
  };
  const sessionPromptProjectPicker = useMemo(() => {
    const sessionRepository = selectedSession?.data.codebase?.id
      ? (repositoryOptions.find(
          (repository) => repository.id === selectedSession.data.codebase?.id,
        ) ?? selectedRepository)
      : selectedSession?.data.cwd
        ? (repositoryOptions.find(
            (repository) => repository.repoPath === selectedSession.data.cwd,
          ) ?? {
            id: selectedSession.data.cwd,
            repoPath: selectedSession.data.cwd,
            sourceUrl: null,
            title:
              selectedSession.data.cwd.split('/').at(-1) ??
              selectedSession.data.cwd,
          })
        : selectedRepository;

    return {
      cloneEndpoint: `/api/projects/${projectState.data.id}/codebases/clone`,
      disabled: false,
      onCreateWorktree: async (codebaseId: string) => {
        const response = await runtimeFetch(
          `/api/projects/${projectState.data.id}/codebases/${codebaseId}/worktrees`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
          },
        );

        if (!response.ok) {
          throw new Error('创建 worktree 失败');
        }

        await selectedCodebaseState
          ?.follow('worktrees')
          .refresh()
          .then((worktreesState) => {
            setWorktrees(mapWorktreeOptions(worktreesState.collection));
          });
        toast.success('已创建新的 worktree');
      },
      onDeleteWorktree: async (input: {
        codebaseId: string;
        deleteBranch?: boolean;
        worktreeId: string;
      }) => {
        const query = input.deleteBranch ? '?deleteBranch=true' : '';
        const response = await runtimeFetch(
          `/api/projects/${projectState.data.id}/worktrees/${input.worktreeId}${query}`,
          {
            method: 'DELETE',
          },
        );

        if (!response.ok) {
          throw new Error('删除 worktree 失败');
        }

        await selectedCodebaseState
          ?.follow('worktrees')
          .refresh()
          .then((worktreesState) => {
            setWorktrees(mapWorktreeOptions(worktreesState.collection));
          });
        toast.success(
          input.deleteBranch ? '已删除 worktree 和分支' : '已删除 worktree',
        );
      },
      onProjectCloned: async (projectId: string) => {
        await codebasesResource.refresh();
        setSelectedRepositoryId(projectId);
      },
      onValidateWorktree: async (input: {
        codebaseId: string;
        worktreeId: string;
      }) => {
        const response = await runtimeFetch(
          `/api/projects/${projectState.data.id}/worktrees/${input.worktreeId}/validate`,
          {
            method: 'POST',
          },
        );
        const payload = (await response.json()) as {
          healthy?: boolean;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? '校验 worktree 失败');
        }

        await selectedCodebaseState
          ?.follow('worktrees')
          .refresh()
          .then((worktreesState) => {
            setWorktrees(mapWorktreeOptions(worktreesState.collection));
          });
        toast.success(
          payload.healthy ? 'Worktree 校验通过' : 'Worktree 校验已更新',
        );
      },
      onValueChange: (repository: ProjectRepositoryOption | null) => {
        if (selectedSession) {
          return;
        }
        setSelectedRepositoryId(repository?.id ?? null);
      },
      projects:
        repositoryOptions.length > 0 ? repositoryOptions : [selectedRepository],
      selectedWorktreeId:
        selectedWorktree?.id ?? selectedSession?.data.worktree?.id ?? null,
      value: sessionRepository,
      worktrees,
      worktreesLoading,
    };
  }, [
    projectState.data.id,
    codebasesResource,
    repositoryOptions,
    selectedRepository,
    selectedCodebaseState,
    selectedSession,
    selectedWorktree?.id,
    worktrees,
    worktreesLoading,
  ]);

  const handleSpecSync = useCallback(async () => {
    if (!specNote) {
      return;
    }

    setSpecSyncLoading(true);
    setMainPane('spec');

    try {
      const response = await runtimeFetch(
        `/api/notes/${specNote.data.id}/spec-task-sync`,
        {
          method: 'POST',
        },
      );

      if (!response.ok) {
        throw new Error('同步 Spec 失败');
      }

      await Promise.all([
        refreshSpecPane(),
        refreshTaskItems(),
        loadSessions(),
      ]);
      toast.success('Spec 已同步到任务面板');
    } catch (error) {
      const message = error instanceof Error ? error.message : '同步 Spec 失败';
      toast.error(message);
    } finally {
      setSpecSyncLoading(false);
    }
  }, [loadSessions, refreshSpecPane, refreshTaskItems, specNote]);

  const handleTaskAction = useCallback(
    async (item: TaskPanelItem, action: TaskPanelAction) => {
      if (!item.taskId) {
        return;
      }

      setPendingTaskAction({
        action,
        taskId: item.id,
      });
      setMainPane('ops');

      try {
        if (action === 'retry') {
          const latestRun = item.taskRuns?.find((run) => run.isLatest) ?? null;

          if (!latestRun) {
            throw new Error('当前任务没有可重试的最新执行记录');
          }

          const retryResponse = await runtimeFetch(
            `/api/task-runs/${latestRun.id}/retry`,
            {
              method: 'POST',
            },
          );

          if (!retryResponse.ok) {
            throw new Error('重试任务失败');
          }
        } else {
          const executeResponse = await runtimeFetch(
            `/api/tasks/${item.taskId}/execute`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                callerSessionId: workbenchSessionId ?? selectedSession?.data.id,
              }),
            },
          );

          if (!executeResponse.ok) {
            throw new Error('启动任务失败');
          }
        }

        await Promise.all([refreshTaskItems(), loadSessions()]);
        toast.success(action === 'retry' ? '任务已重新排队' : '任务已分发');
      } catch (error) {
        const message = error instanceof Error ? error.message : '任务操作失败';
        toast.error(message);
      } finally {
        setPendingTaskAction(null);
      }
    },
    [
      loadSessions,
      refreshTaskItems,
      selectedSession?.data.id,
      workbenchSessionId,
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
    if (manual) {
      setStreamStatus('idle');
    }
  }, []);

  const stopNoteStream = useCallback((manual: boolean) => {
    allowNoteReconnectRef.current = !manual;
    if (noteReconnectTimerRef.current !== null) {
      window.clearTimeout(noteReconnectTimerRef.current);
      noteReconnectTimerRef.current = null;
    }
    if (noteEventSourceRef.current) {
      noteEventSourceRef.current.close();
      noteEventSourceRef.current = null;
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

  const startNoteStream = useCallback(() => {
    if (!workbenchSessionId) {
      return;
    }

    stopNoteStream(false);
    allowNoteReconnectRef.current = true;

    const url = new URL(
      resolveRuntimeApiUrl(
        `/api/projects/${projectState.data.id}/note-events/stream`,
      ),
    );
    const desktopRuntimeConfig = getCurrentDesktopRuntimeConfig();
    if (desktopRuntimeConfig) {
      url.searchParams.set(
        'desktopSessionToken',
        desktopRuntimeConfig.desktopSessionToken,
      );
    }
    const latest = latestNoteEventIdRef.current;
    if (latest) {
      url.searchParams.set('sinceEventId', latest);
    }

    const source = new EventSource(url.toString(), { withCredentials: true });
    const onEvent = (raw: string) => {
      try {
        const parsed = JSON.parse(raw) as Pick<
          NoteEvent['data'],
          'data' | 'eventId' | 'noteId' | 'projectId' | 'sessionId' | 'type'
        >;
        latestNoteEventIdRef.current = parsed.eventId;
        const isSpecEvent = parsed.data.note.type === 'spec';
        const isTaskLinkedEvent = Boolean(parsed.data.note.linkedTaskId);
        const isWorkbenchScoped =
          parsed.data.note.sessionId === null ||
          parsed.data.note.sessionId === workbenchSessionId;

        if (!isWorkbenchScoped && !isTaskLinkedEvent) {
          return;
        }

        if (isSpecEvent) {
          void refreshSpecPane();
        }

        if (isSpecEvent || isTaskLinkedEvent) {
          void refreshTaskItems();
        }
      } catch {
        // ignore non-json payloads
      }
    };

    source.addEventListener('note-event', (event) => {
      onEvent((event as MessageEvent<string>).data);
    });
    source.onmessage = (event) => {
      onEvent(event.data);
    };
    source.onerror = () => {
      source.close();
      noteEventSourceRef.current = null;
      if (!allowNoteReconnectRef.current) {
        return;
      }
      noteReconnectTimerRef.current = window.setTimeout(() => {
        startNoteStream();
      }, STREAM_RETRY_DELAY_MS);
    };
    noteEventSourceRef.current = source;
  }, [
    projectState.data.id,
    refreshSpecPane,
    refreshTaskItems,
    stopNoteStream,
    workbenchSessionId,
  ]);

  useEffect(() => {
    if (!workbenchSessionId) {
      stopNoteStream(true);
      return;
    }

    startNoteStream();
    return () => stopNoteStream(true);
  }, [startNoteStream, stopNoteStream, workbenchSessionId]);

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

  const handleOpenSession = useCallback(
    (sessionId: string) => {
      const target =
        sessions.find((session) => session.data.id === sessionId) ?? null;

      if (!target) {
        return;
      }

      void selectSessionFromList(target);
    },
    [selectSessionFromList, sessions],
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
      sessionAnnotationsById={sessionAnnotationsById}
      sessions={sessionTree}
      sessionsLoading={sessionsLoading}
    />
  );
  const providerFallbackLabel =
    composerProviderId ?? sessionDefaults.providerId ?? '未配置 provider';
  const specPane = (
    <ProjectSessionSpecPane
      note={specNote}
      onSync={handleSpecSync}
      scopeSessionLabel={scopeSessionLabel}
      selectedSession={selectedSession}
      syncLoading={specLoading || specSyncLoading}
      syncSnapshot={specSyncSnapshot}
      tasksLoading={tasksLoading}
      taskItems={taskItems}
    />
  );
  const opsPane = (
    <ProjectSessionStatusSidebar
      events={history}
      onOpenSession={handleOpenSession}
      onTaskAction={handleTaskAction}
      pendingTaskAction={pendingTaskAction}
      providerFallbackLabel={providerFallbackLabel}
      runtimeProfile={runtimeProfile}
      selectedSession={selectedSession}
      streamStatus={streamStatus}
      taskItems={taskItems}
      tasksLoading={tasksLoading}
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
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-border/60 bg-background px-4 py-3 md:px-5">
                <div className="mx-auto w-full max-w-3xl">
                  <ProjectRuntimeProfilePanel
                    onRuntimeProfileChange={onRuntimeProfileChange}
                    projectId={projectState.data.id}
                    runtimeProfile={runtimeProfile}
                  />
                </div>
              </div>

              <div className="border-b border-border/60 bg-background px-4 py-2 xl:hidden">
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={
                      mainPane === 'conversation' ? 'default' : 'outline'
                    }
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setMainPane('conversation')}
                  >
                    会话
                  </Button>
                  <Button
                    type="button"
                    variant={mainPane === 'spec' ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setMainPane('spec')}
                  >
                    Spec
                  </Button>
                  <Button
                    type="button"
                    variant={mainPane === 'ops' ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setMainPane('ops')}
                  >
                    Ops
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1">
                <div className="h-full xl:hidden">
                  {mainPane === 'conversation' ? (
                    <ProjectSessionConversationPane
                      chatMessages={chatMessages}
                      hasPendingAssistantMessage={hasPendingAssistantMessage}
                      modelPicker={sessionPromptModelPicker}
                      onSubmit={handlePromptSubmit}
                      providerPicker={sessionPromptProviderPicker}
                      projectPicker={sessionPromptProjectPicker}
                      selectedSession={selectedSession}
                    />
                  ) : mainPane === 'ops' ? (
                    opsPane
                  ) : (
                    specPane
                  )}
                </div>

                <div className="hidden h-full min-h-0 xl:flex">
                  <div className="min-w-0 flex-1">
                    <ProjectSessionConversationPane
                      chatMessages={chatMessages}
                      hasPendingAssistantMessage={hasPendingAssistantMessage}
                      modelPicker={sessionPromptModelPicker}
                      onSubmit={handlePromptSubmit}
                      providerPicker={sessionPromptProviderPicker}
                      projectPicker={sessionPromptProjectPicker}
                      selectedSession={selectedSession}
                    />
                  </div>

                  <aside className="hidden w-[420px] shrink-0 border-l border-border/60 bg-background xl:flex xl:flex-col">
                    <div className="grid grid-cols-2 gap-2 border-b border-border/60 px-4 py-2">
                      <Button
                        type="button"
                        variant={mainPane === 'spec' ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setMainPane('spec')}
                      >
                        Spec
                      </Button>
                      <Button
                        type="button"
                        variant={mainPane === 'ops' ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setMainPane('ops')}
                      >
                        Ops
                      </Button>
                    </div>
                    <div className="min-h-0 flex-1">
                      {mainPane === 'ops' ? opsPane : specPane}
                    </div>
                  </aside>
                </div>
              </div>
            </div>
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
