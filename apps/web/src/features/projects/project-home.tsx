import { State } from '@hateoas-ts/resource';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { useAcpSession } from '@features/project-conversations';
import {
  AcpSessionSummary,
  type AgentRole,
  Project,
  Role,
  Root,
} from '@shared/schema';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
  CommandSeparator,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@shared/ui';
import { runtimeFetch } from '@shared/util-http';
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  Clock3Icon,
  DownloadIcon,
  FolderGit2Icon,
  GitBranchPlusIcon,
  LoaderCircleIcon,
  SearchIcon,
  WrenchIcon,
} from 'lucide-react';
import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { storePendingProjectPrompt } from './pending-project-prompt';
import { AcpProvider, useAcpProviders } from './use-acp-providers';
import {
  LocalProject,
  projectTitle,
  useProjectSelection,
} from './use-project-selection';

type CloneProjectResponse = {
  cloneStatus: 'cloned' | 'reused';
  createdAt: string;
  description: string | null;
  id: string;
  repoPath: string | null;
  sourceType: 'github' | 'local' | null;
  sourceUrl: string | null;
  title: string;
  updatedAt: string;
};

type PickerTab = 'existing' | 'clone';
type HomeAgentType = Extract<AgentRole, 'ROUTA' | 'DEVELOPER'>;

type DropdownPosition = {
  bottom: number;
  left: number;
  width: number;
};

const HOME_AGENT_OPTIONS: Array<{
  description: string;
  id: HomeAgentType;
  label: string;
  specialistId: string;
}> = [
  {
    id: 'ROUTA',
    label: 'Routa',
    description: '多 agent 协调与委派。',
    specialistId: 'routa-coordinator',
  },
  {
    id: 'DEVELOPER',
    label: 'Developer',
    description: '单 agent 直接推进实现。',
    specialistId: 'solo-developer',
  },
];

function timestamp(value: string | null): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '未知时间';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sessionStateLabel(value: string | null | undefined): string {
  switch (value) {
    case 'PENDING':
      return '待处理';
    case 'PLANNING':
      return '规划中';
    case 'READY':
      return '就绪';
    case 'RUNNING':
      return '进行中';
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
      return value ?? '未知状态';
  }
}

function providerStatusLabel(value: string): string {
  switch (value) {
    case 'available':
      return '可用';
    case 'unavailable':
      return '不可用';
    default:
      return value;
  }
}

function sessionDisplayName(session: State<AcpSessionSummary>): string {
  return session.data.name?.trim() || `会话 ${session.data.id.slice(0, 8)}`;
}

function providerGroupLabel(key: string): string {
  switch (key) {
    case 'static-available':
      return 'Built-in';
    case 'registry-available':
      return 'ACP Registry';
    case 'static-unavailable':
      return 'Built-in - Not Installed';
    case 'registry-unavailable':
      return 'ACP Registry - Not Installed';
    default:
      return key;
  }
}

function sessionAgentDescription(
  agentType: HomeAgentType,
  options = HOME_AGENT_OPTIONS,
): string {
  return (
    options.find((option) => option.id === agentType)?.description ??
    '使用默认 agent。'
  );
}

function sessionAgentLabel(
  value: string | null | undefined,
  options = HOME_AGENT_OPTIONS,
): string | null {
  const matched = options.find(
    (option) => option.id === value || option.specialistId === value,
  );
  return matched?.label ?? null;
}

function normalizeRepositoryUrl(value: string): string {
  return value.trim();
}

function isRepositoryInput(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^https?:\/\/github\.com\//iu.test(trimmed) ||
    /^git@github\.com:/iu.test(trimmed) ||
    /^github\.com\//iu.test(trimmed) ||
    /^[a-zA-Z0-9\-_]+\/[a-zA-Z0-9\-_.]+$/u.test(trimmed)
  );
}

async function readJson<T>(href: string, init?: RequestInit): Promise<T> {
  const response = await runtimeFetch(href, {
    ...init,
    headers: {
      Accept: 'application/hal+json, application/json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(errorText || `请求失败：${response.status}`);
    Object.assign(error, { status: response.status });
    throw error;
  }

  return (await response.json()) as T;
}

export default function ProjectHome() {
  const { projects, refreshProjects, selectedProject } = useProjectSelection();
  const [preferredProjectId, setPreferredProjectId] = useState<string | null>(
    null,
  );

  const activeProject = useMemo(() => {
    if (preferredProjectId) {
      const preferred = projects.find(
        (project) => project.data.id === preferredProjectId,
      );
      if (preferred) {
        return preferred;
      }
    }
    return selectedProject;
  }, [preferredProjectId, projects, selectedProject]);

  if (projects.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>项目</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>当前还没有本地项目，请先导入或创建项目。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activeProject) {
    return null;
  }

  return (
    <ProjectHomeContent
      onProjectCloned={async (projectId) => {
        await refreshProjects();
        setPreferredProjectId(projectId);
      }}
      onProjectSelected={setPreferredProjectId}
      projects={projects}
      selectedProject={activeProject}
    />
  );
}

function ProjectHomeContent(props: {
  onProjectCloned: (projectId: string) => Promise<void>;
  onProjectSelected: (projectId: string) => void;
  projects: State<LocalProject>[];
  selectedProject: State<LocalProject>;
}) {
  const { onProjectCloned, onProjectSelected, projects, selectedProject } =
    props;
  const client = useClient();
  const navigate = useNavigate();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const projectState = selectedProject as unknown as State<Project>;
  const meResource = useMemo(
    () => client.go<Root>('/api').follow('me'),
    [client],
  );
  const rolesResource = useMemo(
    () => projectState.follow('roles'),
    [projectState],
  );
  const { data: me } = useSuspenseResource(meResource);
  const { resourceState: rolesState } = useSuspenseResource(rolesResource);
  const {
    install,
    installingProviderId,
    loading: providersLoading,
    providers,
    registryError,
    reload: reloadProviders,
    selectedProvider,
    selectedProviderId,
    setSelectedProviderId,
  } = useAcpProviders('opencode');
  const { sessionsResource, create } = useAcpSession(projectState, {
    actorUserId: me.id,
    provider: selectedProviderId,
    historyLimit: 50,
  });

  const [prompt, setPrompt] = useState('');
  const [agentType, setAgentType] = useState<HomeAgentType>('ROUTA');
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);
  const [providerDropdownPos, setProviderDropdownPos] = useState<{
    bottom: number;
    left: number;
  } | null>(null);
  const [agentsPanelTab, setAgentsPanelTab] = useState<'agents' | 'providers'>(
    'agents',
  );
  const [providerSheetOpen, setProviderSheetOpen] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [recentSessions, setRecentSessions] = useState<
    State<AcpSessionSummary>[]
  >([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [startingSession, setStartingSession] = useState(false);
  const providerDropdownRef = useRef<HTMLDivElement>(null);
  const providerButtonRef = useRef<HTMLButtonElement>(null);

  const homeAgentOptions = useMemo(
    () =>
      HOME_AGENT_OPTIONS.map((option) => {
        const matched = rolesState.collection.find(
          (role: State<Role>) => role.data.id === option.id,
        );

        return {
          ...option,
          label: matched?.data.name ?? option.label,
          description: matched?.data.description ?? option.description,
        };
      }),
    [rolesState.collection],
  );

  const filteredProviders = useMemo(() => {
    const query = providerSearch.trim().toLowerCase();
    if (!query) {
      return providers;
    }

    return providers.filter((provider) =>
      [
        provider.name,
        provider.id,
        provider.description,
        provider.command,
        provider.envCommandKey,
      ].some((part) => part?.toLowerCase().includes(query)),
    );
  }, [providerSearch, providers]);

  const providerGroups = useMemo(() => {
    const builtinAvailable = filteredProviders.filter(
      (provider) =>
        provider.source !== 'registry' && provider.status === 'available',
    );
    const registryAvailable = filteredProviders.filter(
      (provider) =>
        provider.source === 'registry' && provider.status === 'available',
    );
    const builtinUnavailable = filteredProviders.filter(
      (provider) =>
        provider.source !== 'registry' && provider.status !== 'available',
    );
    const registryUnavailable = filteredProviders.filter(
      (provider) =>
        provider.source === 'registry' && provider.status !== 'available',
    );

    return [
      ['static-available', builtinAvailable] as const,
      ['registry-available', registryAvailable] as const,
      ['static-unavailable', builtinUnavailable] as const,
      ['registry-unavailable', registryUnavailable] as const,
    ].filter(([, items]) => items.length > 0);
  }, [filteredProviders]);

  const availableProviders = useMemo(
    () => providers.filter((provider) => provider.status === 'available'),
    [providers],
  );

  const providerQuickGroups = useMemo(() => {
    const builtinAvailable = providers.filter(
      (provider) =>
        provider.source !== 'registry' && provider.status === 'available',
    );
    const registryAvailable = providers.filter(
      (provider) =>
        provider.source === 'registry' && provider.status === 'available',
    );
    const builtinUnavailable = providers.filter(
      (provider) =>
        provider.source !== 'registry' && provider.status !== 'available',
    );
    const registryUnavailable = providers.filter(
      (provider) =>
        provider.source === 'registry' && provider.status !== 'available',
    );

    return [
      ['static-available', builtinAvailable] as const,
      ['registry-available', registryAvailable] as const,
      ['static-unavailable', builtinUnavailable] as const,
      ['registry-unavailable', registryUnavailable] as const,
    ].filter(([, items]) => items.length > 0);
  }, [providers]);

  useEffect(() => {
    if (!providerDropdownOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideDropdown = providerDropdownRef.current?.contains(target);
      const insideButton = providerButtonRef.current?.contains(target);

      if (!insideDropdown && !insideButton) {
        setProviderDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [providerDropdownOpen]);

  const loadRecentSessions = useCallback(async () => {
    setLoadingRecent(true);
    try {
      let currentPage = await sessionsResource.refresh();
      const allSessions = [...currentPage.collection];
      while (currentPage.hasLink('next')) {
        currentPage = await currentPage.follow('next').get();
        allSessions.push(...currentPage.collection);
      }
      allSessions.sort((left, right) => {
        const leftTime = timestamp(
          left.data.lastActivityAt ??
            left.data.startedAt ??
            left.data.completedAt,
        );
        const rightTime = timestamp(
          right.data.lastActivityAt ??
            right.data.startedAt ??
            right.data.completedAt,
        );
        return rightTime - leftTime;
      });
      setRecentSessions(allSessions.slice(0, 8));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load ACP sessions';
      toast.error(message);
    } finally {
      setLoadingRecent(false);
    }
  }, [sessionsResource]);

  useEffect(() => {
    void loadRecentSessions();
  }, [loadRecentSessions]);

  const handleCloneRepository = useCallback(
    async (repositoryUrl: string) => {
      const normalizedUrl = normalizeRepositoryUrl(repositoryUrl);
      if (!normalizedUrl) {
        throw new Error('请输入 GitHub 仓库地址');
      }

      const project = await readJson<CloneProjectResponse>(
        '/api/projects/clone',
        {
          method: 'POST',
          body: JSON.stringify({
            repositoryUrl: normalizedUrl,
          }),
        },
      );

      await onProjectCloned(project.id);
      toast.success(
        project.cloneStatus === 'reused'
          ? '已复用本地仓库副本'
          : '仓库已完成 clone',
      );
    },
    [onProjectCloned],
  );

  const handleHomeSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const goal = prompt.trim();

      if (!goal) {
        toast.error('输入内容不能为空');
        return;
      }
      if (!selectedProvider) {
        toast.error('当前没有可用的 ACP 提供方');
        setAgentsPanelTab('agents');
        setProviderSheetOpen(true);
        return;
      }
      if (selectedProvider.status !== 'available') {
        toast.error(`提供方 ${selectedProvider.name} 当前尚未就绪`);
        setAgentsPanelTab('agents');
        setProviderSheetOpen(true);
        return;
      }

      setStartingSession(true);
      try {
        const created = await create({
          actorUserId: me.id,
          provider: selectedProvider.id,
          role: agentType,
          goal,
        });
        storePendingProjectPrompt(created.data.id, goal);
        setPrompt('');
        await loadRecentSessions();
        navigate(`/sessions/${created.data.id}`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '创建 ACP 会话失败';
        toast.error(message);
      } finally {
        setStartingSession(false);
      }
    },
    [
      agentType,
      create,
      loadRecentSessions,
      me.id,
      navigate,
      prompt,
      selectedProvider,
    ],
  );

  const handlePromptKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey) {
        return;
      }

      event.preventDefault();

      if (startingSession || prompt.trim().length === 0) {
        return;
      }

      event.currentTarget.form?.requestSubmit();
    },
    [prompt, startingSession],
  );

  return (
    <div className="min-w-0 bg-[#fafafa] p-4 dark:bg-[#0a0c12] md:p-6">
      <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center gap-6 py-4 md:gap-8 md:py-8">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
              项目
            </p>
            <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-xl">
              {projectTitle(selectedProject)}
            </h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 rounded-xl px-3 text-xs"
            onClick={() => {
              setAgentsPanelTab('agents');
              setProviderSheetOpen(true);
            }}
          >
            <DownloadIcon className="size-4" />
            Agents
          </Button>
        </div>

        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
            <span className="size-2 rounded-full bg-blue-500 ring-4 ring-blue-500/15" />
            发起会话
          </div>
          <p className="mx-auto mb-4 max-w-xl text-center text-sm leading-6 text-gray-500 dark:text-gray-400">
            输入首条指令后，会自动创建会话并进入项目协作。
          </p>
          <div className="group relative" id="home-input-container">
            <div className="pointer-events-none absolute -inset-1 rounded-[28px] bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-amber-500/20 opacity-0 blur-xl transition-opacity duration-500 group-focus-within:opacity-100" />
            <form
              className="relative overflow-visible rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_60px_-28px_rgba(15,23,42,0.35)] transition-colors group-focus-within:border-amber-300/70 dark:border-[#1c1f2e] dark:bg-[#12141c] dark:shadow-none dark:group-focus-within:border-amber-500/30"
              onSubmit={handleHomeSubmit}
            >
              <div className="px-4 pb-2 pt-3 md:px-5 md:pt-4">
                <Textarea
                  ref={promptRef}
                  className="max-h-60 min-h-28 w-full resize-none border-0 bg-transparent px-0 py-0 text-sm leading-7 text-slate-900 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:text-slate-100 md:text-[15px]"
                  disabled={startingSession}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={handlePromptKeyDown}
                  placeholder="你想在这个项目里完成什么？可以直接描述需求、约束和期望结果。"
                  value={prompt}
                />
              </div>

              <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 md:px-5 dark:border-[#1c1f2e]">
                <RepositoryPicker
                  onClone={handleCloneRepository}
                  onSelect={onProjectSelected}
                  projects={projects}
                  value={selectedProject}
                />

                <div
                  className="flex items-center rounded-lg bg-slate-100 p-0.5 dark:bg-[#1a1d2a]"
                  role="group"
                  aria-label="Agent type"
                >
                  {homeAgentOptions.map((option) => (
                    <button
                      key={option.id}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        agentType === option.id
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-[#1f2233] dark:text-slate-100'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                      }`}
                      onClick={() => setAgentType(option.id)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="hidden items-center text-[11px] text-slate-400 md:flex dark:text-slate-500">
                  Enter 发送
                  <span className="mx-2 text-slate-300 dark:text-slate-700">
                    &middot;
                  </span>
                  Shift + Enter 换行
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <Button
                    ref={providerButtonRef}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (providerDropdownOpen) {
                        setProviderDropdownOpen(false);
                        return;
                      }

                      const rect =
                        providerButtonRef.current?.getBoundingClientRect();
                      if (rect) {
                        setProviderDropdownPos({
                          left: rect.left,
                          bottom: window.innerHeight - rect.top + 4,
                        });
                      }
                      setProviderDropdownOpen(true);
                    }}
                    className="h-8 rounded-lg px-2.5 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    <span
                      className={`size-2 rounded-full ${
                        selectedProvider?.status === 'available'
                          ? 'bg-emerald-500'
                          : 'bg-amber-500'
                      }`}
                    />
                    {selectedProvider?.name ?? selectedProviderId}
                    <ChevronDownIcon
                      className={`size-3 text-slate-400 transition-transform ${
                        providerDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </Button>

                  <Button
                    className="size-9 rounded-xl p-0"
                    disabled={startingSession || prompt.trim().length === 0}
                    type="submit"
                  >
                    {startingSession ? (
                      <LoaderCircleIcon className="size-4 animate-spin" />
                    ) : (
                      <ArrowRightIcon className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>

          {providerDropdownOpen &&
          providerDropdownPos &&
          typeof document !== 'undefined'
            ? createPortal(
                <div
                  ref={providerDropdownRef}
                  className="fixed z-[9999] max-h-80 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-[#1e2130]"
                  style={{
                    left: providerDropdownPos.left,
                    bottom: providerDropdownPos.bottom,
                  }}
                >
                  {providerQuickGroups.map(([groupKey, items], index) => (
                    <div
                      key={groupKey}
                      className={
                        index === 0
                          ? 'py-1'
                          : 'border-t border-gray-100 py-1 dark:border-gray-800'
                      }
                    >
                      <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        {providerGroupLabel(groupKey)} ({items.length})
                      </div>
                      {items.map((provider) => {
                        const isAvailable = provider.status === 'available';
                        const isSelected = provider.id === selectedProviderId;

                        return (
                          <button
                            key={provider.id}
                            type="button"
                            onClick={() => {
                              if (isAvailable) {
                                setSelectedProviderId(provider.id);
                                setProviderDropdownOpen(false);
                                return;
                              }

                              setSelectedProviderId(provider.id);
                              setProviderDropdownOpen(false);
                              setAgentsPanelTab('agents');
                              setProviderSheetOpen(true);
                            }}
                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                              isSelected
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                : isAvailable
                                  ? 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50'
                                  : 'text-gray-500 opacity-60 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/50'
                            }`}
                          >
                            <span
                              className={`size-1.5 shrink-0 rounded-full ${
                                isAvailable
                                  ? 'bg-green-500'
                                  : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                            />
                            <span className="flex-1 truncate font-medium">
                              {provider.name}
                            </span>
                            <span className="max-w-[140px] truncate font-mono text-[10px] text-gray-400 dark:text-gray-500">
                              {provider.command ?? provider.envCommandKey}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}

                  <div className="border-t border-gray-100 p-2 dark:border-gray-800">
                    <div className="px-2 py-1 text-center text-[10px] text-gray-400 dark:text-gray-500">
                      Agent 管理入口位于页头
                    </div>
                  </div>
                </div>,
                document.body,
              )
            : null}

          <div className="mt-2 px-1 text-[10px] text-slate-400 dark:text-slate-500">
            {sessionAgentDescription(agentType, homeAgentOptions)}
          </div>
        </div>

        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
            <Clock3Icon className="size-4 text-gray-400 dark:text-gray-500" />
            最近会话
          </div>
          {loadingRecent ? (
            <Card className="border-gray-100 bg-white/90 shadow-sm dark:border-[#1c1f2e] dark:bg-[#12141c]">
              <CardContent className="py-6 text-sm text-muted-foreground">
                正在加载最近会话...
              </CardContent>
            </Card>
          ) : recentSessions.length === 0 ? (
            <Card className="border-gray-100 bg-white/90 shadow-sm dark:border-[#1c1f2e] dark:bg-[#12141c]">
              <CardContent className="py-6 text-sm text-muted-foreground">
                暂无 ACP 会话，从上方输入开始。
              </CardContent>
            </Card>
          ) : (
            <Card className="border-gray-100 bg-white/90 shadow-sm dark:border-[#1c1f2e] dark:bg-[#12141c]">
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
                <div>
                  <CardTitle className="text-sm font-medium">
                    继续最近的会话
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    从当前项目最近的 ACP 会话继续。
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {recentSessions.length} 条
                </span>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
                {recentSessions.map((session) => (
                  <button
                    key={session.data.id}
                    type="button"
                    onClick={() => navigate(`/sessions/${session.data.id}`)}
                    className="group rounded-xl border border-gray-100 bg-[#fcfcfc] px-3.5 py-3 text-left transition-all hover:border-amber-200 hover:bg-amber-50/60 hover:shadow-sm dark:border-[#1c1f2e] dark:bg-[#0f1118] dark:hover:border-amber-700/40 dark:hover:bg-amber-900/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-blue-500" />
                          <span className="truncate text-sm font-medium text-gray-800 transition-colors group-hover:text-amber-700 dark:text-gray-100 dark:group-hover:text-amber-400">
                            {sessionDisplayName(session)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                          {sessionAgentLabel(
                            session.data.specialistId,
                            homeAgentOptions,
                          ) ? (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                              {sessionAgentLabel(
                                session.data.specialistId,
                                homeAgentOptions,
                              )}
                            </span>
                          ) : null}
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {sessionStateLabel(session.data.state)}
                          </span>
                          <span>
                            {formatDateTime(
                              session.data.lastActivityAt ??
                                session.data.startedAt ??
                                session.data.completedAt,
                            )}
                          </span>
                        </div>
                      </div>
                      <ArrowRightIcon className="size-4 shrink-0 text-gray-300 transition-colors group-hover:text-amber-500 dark:text-gray-600 dark:group-hover:text-amber-400" />
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <Dialog open={providerSheetOpen} onOpenChange={setProviderSheetOpen}>
        <DialogContent className="flex h-[min(820px,calc(100vh-2rem))] w-[min(960px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0">
          <DialogHeader className="border-b border-slate-100 px-6 py-5 dark:border-[#1c1f2e]">
            <DialogTitle>Agents</DialogTitle>
            <DialogDescription>
              对齐 Routa 的 CLI 管理方式：先看可用项，再决定安装和切换当前
              provider。
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={agentsPanelTab}
            onValueChange={(value) =>
              setAgentsPanelTab(value === 'providers' ? 'providers' : 'agents')
            }
            className="flex min-h-0 flex-1 flex-col bg-white dark:bg-[#12141c]"
          >
            <div className="border-b border-slate-100 px-5 py-4 dark:border-[#1c1f2e]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    CLI 工具下载与管理
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    选择当前 provider，或从 registry 安装缺失的 CLI。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg px-2.5 text-xs"
                  onClick={() => void reloadProviders()}
                  disabled={providersLoading}
                >
                  {providersLoading ? (
                    <LoaderCircleIcon className="size-4 animate-spin" />
                  ) : (
                    <WrenchIcon className="size-4" />
                  )}
                  刷新
                </Button>
              </div>

              <TabsList className="mt-4 grid h-9 w-full grid-cols-2 rounded-xl bg-slate-100 dark:bg-[#1a1d2a]">
                <TabsTrigger value="agents" className="rounded-lg text-xs">
                  Agents
                </TabsTrigger>
                <TabsTrigger value="providers" className="rounded-lg text-xs">
                  Providers
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="agents"
              className="mt-0 flex min-h-0 flex-1 flex-col"
            >
              <div className="border-b border-slate-100 px-5 py-3 dark:border-[#1c1f2e]">
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                    可用 {availableProviders.length}
                  </span>
                  <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                    待安装{' '}
                    {
                      providers.filter(
                        (provider) => provider.status !== 'available',
                      ).length
                    }
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600 dark:bg-[#1f2233] dark:text-slate-300">
                    Registry{' '}
                    {
                      providers.filter(
                        (provider) => provider.source === 'registry',
                      ).length
                    }
                  </span>
                </div>

                {registryError ? (
                  <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                    注册表暂不可用：{registryError}
                  </div>
                ) : null}
              </div>

              <Command
                shouldFilter={false}
                className="flex min-h-0 flex-1 rounded-none"
              >
                <CommandInput
                  value={providerSearch}
                  onValueChange={setProviderSearch}
                  placeholder="搜索 provider、命令或运行时"
                />
                <CommandList className="max-h-none flex-1">
                  <ScrollArea className="h-[calc(100vh-19rem)]">
                    <div className="px-5 py-3">
                      {providersLoading && providers.length === 0 ? (
                        <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                          正在加载 CLI 工具列表...
                        </div>
                      ) : providerGroups.length === 0 ? (
                        <CommandEmpty>
                          {providerSearch.trim()
                            ? '没有匹配的 provider'
                            : '没有可用 provider'}
                        </CommandEmpty>
                      ) : (
                        <div className="space-y-5">
                          {providerGroups.map(([groupKey, items], index) => (
                            <div key={groupKey}>
                              {index > 0 ? (
                                <CommandSeparator className="mb-4" />
                              ) : null}
                              <CommandGroup
                                heading={`${providerGroupLabel(groupKey)} (${items.length})`}
                                className="p-0"
                              >
                                <div className="space-y-2">
                                  {items.map((provider) => (
                                    <div key={provider.id} className="px-1">
                                      <ProviderCard
                                        installing={
                                          installingProviderId === provider.id
                                        }
                                        isSelected={
                                          provider.id === selectedProviderId
                                        }
                                        onInstall={() =>
                                          void install(provider.id)
                                        }
                                        onSelect={() =>
                                          setSelectedProviderId(provider.id)
                                        }
                                        provider={provider}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </CommandGroup>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CommandList>
              </Command>
            </TabsContent>

            <TabsContent
              value="providers"
              className="mt-0 flex min-h-0 flex-1 flex-col"
            >
              <ScrollArea className="flex-1 px-5 py-4">
                <div className="space-y-4">
                  <Card>
                    <CardContent className="space-y-3 p-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          当前默认 Provider
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          会话入口会优先使用这里选中的 CLI。
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[#2a2d3d] dark:bg-[#161922]">
                        <div className="flex items-center gap-2">
                          <span
                            className={`size-2 rounded-full ${
                              selectedProvider?.status === 'available'
                                ? 'bg-emerald-500'
                                : 'bg-amber-500'
                            }`}
                          />
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {selectedProvider?.name ?? selectedProviderId}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          {selectedProvider?.description ??
                            '未找到 provider 描述'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="space-y-3 p-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          可用 Provider
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          这里只显示已经可直接切换使用的 CLI。
                        </p>
                      </div>
                      <div className="space-y-2">
                        {availableProviders.length === 0 ? (
                          <p className="text-xs text-slate-400">
                            当前没有可直接使用的 provider，请到 Agents 页安装。
                          </p>
                        ) : (
                          availableProviders.map((provider) => (
                            <button
                              key={provider.id}
                              type="button"
                              onClick={() => setSelectedProviderId(provider.id)}
                              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                                provider.id === selectedProviderId
                                  ? 'border-amber-300 bg-amber-50/70 dark:border-amber-700/40 dark:bg-amber-900/10'
                                  : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-[#2a2d3d] dark:bg-[#161922] dark:hover:border-[#3a3d4d]'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {provider.name}
                                </div>
                                <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                  {provider.command ?? provider.envCommandKey}
                                </div>
                              </div>
                              {provider.id === selectedProviderId ? (
                                <CheckCircle2Icon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                              ) : null}
                            </button>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>

            <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400 dark:border-[#1c1f2e] dark:text-slate-500">
              数据来源：ACP provider 注册表与本地运行时检查
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RepositoryPicker(props: {
  onClone: (repositoryUrl: string) => Promise<void>;
  onSelect: (projectId: string) => void;
  projects: State<LocalProject>[];
  value: State<LocalProject> | null;
}) {
  const { onClone, onSelect, projects, value } = props;
  const [activeTab, setActiveTab] = useState<PickerTab>('existing');
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloning, setCloning] = useState(false);
  const [dropdownPosition, setDropdownPosition] =
    useState<DropdownPosition | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const cloneInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return projects;
    }

    return projects.filter((project) =>
      [
        projectTitle(project),
        project.data.sourceUrl,
        project.data.repoPath,
      ].some((valuePart) => valuePart?.toLowerCase().includes(normalizedQuery)),
    );
  }, [projects, searchQuery]);

  useEffect(() => {
    if (!searchQuery || !isRepositoryInput(searchQuery)) {
      return;
    }

    setActiveTab('clone');
    setCloneUrl(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (!showDropdown) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideDropdown = containerRef.current?.contains(target);
      const insideTrigger = triggerRef.current?.contains(target);

      if (!insideDropdown && !insideTrigger) {
        setShowDropdown(false);
      }
    };

    const handleWindowChange = () => {
      if (!triggerRef.current) {
        return;
      }

      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
        width: Math.max(rect.width, 420),
      });
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [showDropdown]);

  useEffect(() => {
    if (!showDropdown) {
      return;
    }

    const focusTarget =
      activeTab === 'clone' ? cloneInputRef.current : searchInputRef.current;
    focusTarget?.focus();
  }, [activeTab, showDropdown]);

  const openDropdown = useCallback(() => {
    if (!triggerRef.current) {
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPosition({
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left,
      width: Math.max(rect.width, 420),
    });
    setShowDropdown(true);
  }, []);

  const handleClone = useCallback(async () => {
    const repositoryUrl = normalizeRepositoryUrl(cloneUrl);
    if (!repositoryUrl || cloning) {
      return;
    }

    setCloning(true);
    setCloneError(null);

    try {
      await onClone(repositoryUrl);
      setShowDropdown(false);
      setCloneUrl('');
      setSearchQuery('');
    } catch (error) {
      setCloneError(error instanceof Error ? error.message : '仓库准备失败');
    } finally {
      setCloning(false);
    }
  }, [cloneUrl, cloning, onClone]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1c1f2e] dark:hover:text-slate-100"
        onClick={() => {
          if (showDropdown) {
            setShowDropdown(false);
            return;
          }

          openDropdown();
        }}
        type="button"
      >
        <FolderGit2Icon className="size-3.5 shrink-0" />
        <span className="max-w-44 truncate">
          {value ? projectTitle(value) : '选择或 clone 仓库'}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-slate-400" />
      </button>

      {showDropdown && dropdownPosition
        ? createPortal(
            <div
              ref={containerRef}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_-24px_rgba(15,23,42,0.45)] dark:border-[#1c1f2e] dark:bg-[#181b26]"
              style={{
                bottom: dropdownPosition.bottom,
                left: dropdownPosition.left,
                position: 'fixed',
                width: dropdownPosition.width,
                zIndex: 9999,
              }}
            >
              <div className="flex border-b border-slate-100 dark:border-[#1c1f2e]">
                <button
                  className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-xs font-medium transition ${
                    activeTab === 'existing'
                      ? 'bg-slate-50 text-slate-900 dark:bg-[#1f2233] dark:text-slate-100'
                      : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-[#1f2233]'
                  }`}
                  onClick={() => setActiveTab('existing')}
                  type="button"
                >
                  <FolderGit2Icon className="size-3.5" />
                  已有仓库
                </button>
                <button
                  className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-xs font-medium transition ${
                    activeTab === 'clone'
                      ? 'bg-slate-50 text-slate-900 dark:bg-[#1f2233] dark:text-slate-100'
                      : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-[#1f2233]'
                  }`}
                  onClick={() => setActiveTab('clone')}
                  type="button"
                >
                  <GitBranchPlusIcon className="size-3.5" />
                  Clone 仓库
                </button>
              </div>

              {activeTab === 'existing' ? (
                <>
                  <div className="border-b border-slate-100 p-3 dark:border-[#1c1f2e]">
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 dark:border-[#2a2d3d] dark:bg-[#161922]">
                      <SearchIcon className="size-3.5 text-slate-400" />
                      <Input
                        ref={searchInputRef}
                        className="h-9 border-0 bg-transparent px-0 text-xs text-slate-900 shadow-none focus-visible:ring-0 dark:text-slate-100"
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="搜索仓库，或直接粘贴 GitHub 地址"
                        value={searchQuery}
                      />
                    </div>
                  </div>

                  <div className="max-h-72 overflow-y-auto p-2">
                    {filteredProjects.length > 0 ? (
                      filteredProjects.map((project) => {
                        const selected = value?.data.id === project.data.id;

                        return (
                          <button
                            key={project.data.id}
                            className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
                              selected
                                ? 'bg-sky-50 text-sky-950 dark:bg-sky-900/20 dark:text-sky-100'
                                : 'hover:bg-slate-50 dark:hover:bg-[#1f2233]'
                            }`}
                            onClick={() => {
                              onSelect(project.data.id);
                              setShowDropdown(false);
                            }}
                            type="button"
                          >
                            <div className="rounded-lg bg-slate-100 p-2 text-slate-500 dark:bg-[#1f2233] dark:text-slate-400">
                              <FolderGit2Icon className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {projectTitle(project)}
                              </p>
                              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                {project.data.sourceUrl ?? '未记录来源地址'}
                              </p>
                              <p className="mt-1 truncate text-[11px] text-slate-400 dark:text-slate-500">
                                {project.data.repoPath ?? '未记录本地目录'}
                              </p>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3 py-6 text-xs text-slate-500 dark:text-slate-400">
                        {projects.length === 0
                          ? '还没有已托管仓库，切换到“Clone 仓库”开始。'
                          : '没有匹配的仓库。'}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-3 p-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium tracking-[0.14em] text-slate-500 uppercase dark:text-slate-400">
                      仓库地址
                    </label>
                    <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 dark:border-[#2a2d3d] dark:bg-[#161922]">
                      <span className="shrink-0 text-[11px] font-mono text-slate-400">
                        github.com/
                      </span>
                      <Input
                        ref={cloneInputRef}
                        className="border-0 bg-transparent px-1.5 text-xs font-mono shadow-none focus-visible:ring-0"
                        onChange={(event) => {
                          setCloneError(null);
                          setCloneUrl(event.target.value);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void handleClone();
                          }
                        }}
                        placeholder="owner/repo"
                        value={cloneUrl.replace(
                          /^(https?:\/\/)?(www\.)?github\.com\//iu,
                          '',
                        )}
                      />
                    </div>
                  </div>

                  {cloneError ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/10 dark:text-red-300">
                      {cloneError}
                    </div>
                  ) : null}

                  <Button
                    className="w-full"
                    disabled={
                      cloning || normalizeRepositoryUrl(cloneUrl).length === 0
                    }
                    onClick={() => void handleClone()}
                    type="button"
                  >
                    {cloning ? (
                      <>
                        <LoaderCircleIcon className="size-4 animate-spin" />
                        准备仓库中...
                      </>
                    ) : (
                      <>
                        Clone 仓库
                        <ArrowRightIcon className="size-4" />
                      </>
                    )}
                  </Button>

                  <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                    仓库会被 clone 到本地受管目录，并作为后续执行的工作目录。
                  </p>
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function ProviderCard(props: {
  installing: boolean;
  isSelected: boolean;
  onInstall: () => void;
  onSelect: () => void;
  provider: AcpProvider;
}) {
  const { installing, isSelected, onInstall, onSelect, provider } = props;
  const canUse = provider.status === 'available';

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 transition-colors hover:border-slate-300 dark:border-[#2a2d3d] dark:bg-[#161922]/70 dark:hover:border-[#3a3d4d]">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-sm font-semibold text-white">
          {provider.name.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {provider.name}
            </h3>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:bg-[#1f2233] dark:text-slate-400">
              {provider.id}
            </span>
            {isSelected ? (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                Selected
              </span>
            ) : null}
          </div>

          <p className="mb-2 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
            {provider.description}
          </p>

          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
            <span
              className={`rounded px-1.5 py-0.5 ${
                provider.status === 'available'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-[#1f2233] dark:text-slate-400'
              }`}
            >
              {providerStatusLabel(provider.status)}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-[#1f2233]">
              {provider.source}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-[#1f2233]">
              {provider.command ?? provider.envCommandKey}
            </span>
            <div className="flex gap-1">
              {provider.distributionTypes.map((distributionType) => (
                <span
                  key={distributionType}
                  className={`rounded px-1 py-0.5 ${
                    provider.installable
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300'
                      : 'bg-slate-100 text-slate-400 line-through dark:bg-[#1f2233] dark:text-slate-500'
                  }`}
                >
                  {distributionType}
                </span>
              ))}
            </div>
          </div>

          {provider.unavailableReason ? (
            <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              {provider.unavailableReason}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {provider.installable ? (
            <Button
              type="button"
              variant={provider.installed ? 'outline' : 'default'}
              size="sm"
              onClick={onInstall}
              disabled={installing}
              className="h-8 rounded-md px-3 text-xs"
            >
              {installing ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : (
                <DownloadIcon className="size-4" />
              )}
              {installing
                ? 'Installing...'
                : provider.installed
                  ? 'Reinstall'
                  : 'Install'}
            </Button>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant={isSelected ? 'secondary' : 'outline'}
            onClick={onSelect}
            disabled={!canUse}
            className="h-8 rounded-md px-3 text-xs"
          >
            {isSelected ? (
              <CheckCircle2Icon className="size-4" />
            ) : (
              <WrenchIcon className="size-4" />
            )}
            {isSelected ? 'Using' : 'Use'}
          </Button>
        </div>
      </div>
    </div>
  );
}
