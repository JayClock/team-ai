import { State } from '@hateoas-ts/resource';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { useAcpSession } from '@features/project-conversations';
import {
  ProjectComposerInput,
  type ProjectRepositoryOption,
  type ProjectWorktreeOption,
  useAcpProviders,
} from '@features/projects';
import {
  AcpSessionSummary,
  type AgentRole,
  Codebase,
  Project,
  Role,
  Root,
  Worktree,
} from '@shared/schema';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  toast,
} from '@shared/ui';
import { runtimeFetch } from '@shared/util-http';
import { ArrowRightIcon, Clock3Icon, DownloadIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgentInstallPanel } from './agent-install-panel';
import { storePendingProjectPrompt } from './pending-project-prompt';
import {
  LocalProject,
  projectTitle,
  useProjectSelection,
} from './use-project-selection';

type HomeAgentType = Extract<AgentRole, 'ROUTA' | 'DEVELOPER'>;

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
    case 'ready':
      return '就绪';
    case 'connecting':
      return '连接中';
    case 'error':
      return '错误';
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

function sessionDisplayName(session: State<AcpSessionSummary>): string {
  return session.data.name?.trim() || `会话 ${session.data.id.slice(0, 8)}`;
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

export function ShellsSessions() {
  const { projects, selectedProject } = useProjectSelection();
  const activeProject = selectedProject;

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

  return <ShellsSessionsContent selectedProject={activeProject} />;
}

function ShellsSessionsContent(props: {
  selectedProject: State<LocalProject>;
}) {
  const { selectedProject } = props;
  const client = useClient();
  const navigate = useNavigate();
  const selectedProjectId = selectedProject.data.id;
  const projectState = selectedProject as unknown as State<Project>;
  const meResource = useMemo(
    () => client.go<Root>('/api').follow('me'),
    [client],
  );
  const rolesResource = useMemo(
    () => projectState.follow('roles'),
    [projectState],
  );
  const codebasesResource = useMemo(
    () => projectState.follow('codebases'),
    [projectState],
  );
  const { data: me } = useSuspenseResource(meResource);
  const { resourceState: rolesState } = useSuspenseResource(rolesResource);
  const { resourceState: codebasesState } =
    useSuspenseResource(codebasesResource);
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

  const [agentType, setAgentType] = useState<HomeAgentType>('ROUTA');
  const [providerSheetOpen, setProviderSheetOpen] = useState(false);
  const [recentSessions, setRecentSessions] = useState<
    State<AcpSessionSummary>[]
  >([]);
  const [worktrees, setWorktrees] = useState<ProjectWorktreeOption[]>([]);
  const [worktreesLoading, setWorktreesLoading] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<
    string | null
  >(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [startingSession, setStartingSession] = useState(false);

  useEffect(() => {
    setSelectedModelId(null);
  }, [selectedProviderId]);

  useEffect(() => {
    if (
      selectedRepositoryId &&
      codebasesState.collection.some(
        (codebase: State<Codebase>) =>
          codebase.data.id === selectedRepositoryId,
      )
    ) {
      return;
    }

    const fallbackCodebase =
      codebasesState.collection.find(
        (codebase: State<Codebase>) => codebase.data.isDefault,
      ) ?? codebasesState.collection[0];

    setSelectedRepositoryId(fallbackCodebase?.data.id ?? null);
  }, [codebasesState.collection, selectedRepositoryId]);

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
      ) ?? {
        id: selectedProject.data.id,
        repoPath: selectedProject.data.repoPath,
        sourceUrl: selectedProject.data.sourceUrl,
        title: projectTitle(selectedProject),
      },
    [repositoryOptions, selectedProject, selectedRepositoryId],
  );
  const selectedCodebaseState = useMemo(
    () =>
      codebasesState.collection.find(
        (codebase) => codebase.data.id === selectedRepository.id,
      ) ?? null,
    [codebasesState.collection, selectedRepository.id],
  );

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

        setWorktrees(
          worktreesState.collection.map((worktree: State<Worktree>) => ({
            id: worktree.data.id,
            codebaseId: worktree.data.codebaseId,
            branch: worktree.data.branch,
            baseBranch: worktree.data.baseBranch,
            status: worktree.data.status,
            worktreePath: worktree.data.worktreePath,
            sessionId: worktree.data.sessionId,
            label: worktree.data.label,
            errorMessage: worktree.data.errorMessage,
          })),
        );
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

  const submitHomePrompt = useCallback(
    async (input: {
      cwd?: string;
      files: unknown[];
      model?: string | null;
      provider?: string;
      text: string;
    }) => {
      const goal = input.text.trim();
      const cwd = input.cwd?.trim() || selectedRepository.repoPath || undefined;
      const providerId = input.provider?.trim() || selectedProvider?.id;
      const modelId = input.model?.trim() || selectedModelId || undefined;

      if (!goal) {
        toast.error('输入内容不能为空');
        throw new Error('输入内容不能为空');
      }
      if (!providerId) {
        toast.error('当前没有可启动的 ACP 提供方');
        throw new Error('当前没有可启动的 ACP 提供方');
      }

      setStartingSession(true);
      try {
        const created = await create({
          actorUserId: me.id,
          cwd,
          model: modelId,
          provider: providerId,
          role: agentType,
          goal,
        });
        storePendingProjectPrompt(created.data.id, goal);
        await loadRecentSessions();
        navigate(`/projects/${selectedProjectId}/sessions/${created.data.id}`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '创建 ACP 会话失败';
        toast.error(message);
        throw error;
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
      selectedModelId,
      selectedRepository.repoPath,
      selectedProvider,
      selectedProjectId,
    ],
  );

  const projectPicker = useMemo(
    () => ({
      cloneEndpoint: `/api/projects/${selectedProjectId}/codebases/clone`,
      onCreateWorktree: async (codebaseId: string) => {
        const response = await runtimeFetch(
          `/api/projects/${selectedProjectId}/codebases/${codebaseId}/worktrees`,
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
            setWorktrees(
              worktreesState.collection.map((worktree: State<Worktree>) => ({
                id: worktree.data.id,
                codebaseId: worktree.data.codebaseId,
                branch: worktree.data.branch,
                baseBranch: worktree.data.baseBranch,
                status: worktree.data.status,
                worktreePath: worktree.data.worktreePath,
                sessionId: worktree.data.sessionId,
                label: worktree.data.label,
                errorMessage: worktree.data.errorMessage,
              })),
            );
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
          `/api/projects/${selectedProjectId}/worktrees/${input.worktreeId}${query}`,
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
            setWorktrees(
              worktreesState.collection.map((worktree: State<Worktree>) => ({
                id: worktree.data.id,
                codebaseId: worktree.data.codebaseId,
                branch: worktree.data.branch,
                baseBranch: worktree.data.baseBranch,
                status: worktree.data.status,
                worktreePath: worktree.data.worktreePath,
                sessionId: worktree.data.sessionId,
                label: worktree.data.label,
                errorMessage: worktree.data.errorMessage,
              })),
            );
          });
        toast.success(
          input.deleteBranch ? '已删除 worktree 和分支' : '已删除 worktree',
        );
      },
      onProjectCloned: async (projectId: string) => {
        await codebasesResource.refresh();
        setSelectedRepositoryId(projectId);
      },
      onValueChange: (project: ProjectRepositoryOption | null) =>
        setSelectedRepositoryId(project?.id ?? null),
      projects:
        repositoryOptions.length > 0
          ? repositoryOptions
          : [
              {
                id: selectedRepository.id,
                isDefault: true,
                repoPath: selectedRepository.repoPath,
                sourceUrl: selectedRepository.sourceUrl,
                title: selectedRepository.title,
              },
            ],
      onValidateWorktree: async (input: {
        codebaseId: string;
        worktreeId: string;
      }) => {
        const response = await runtimeFetch(
          `/api/projects/${selectedProjectId}/worktrees/${input.worktreeId}/validate`,
          {
            method: 'POST',
          },
        );
        const payload = (await response.json()) as {
          error?: string;
          healthy?: boolean;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? '校验 worktree 失败');
        }

        await selectedCodebaseState
          ?.follow('worktrees')
          .refresh()
          .then((worktreesState) => {
            setWorktrees(
              worktreesState.collection.map((worktree: State<Worktree>) => ({
                id: worktree.data.id,
                codebaseId: worktree.data.codebaseId,
                branch: worktree.data.branch,
                baseBranch: worktree.data.baseBranch,
                status: worktree.data.status,
                worktreePath: worktree.data.worktreePath,
                sessionId: worktree.data.sessionId,
                label: worktree.data.label,
                errorMessage: worktree.data.errorMessage,
              })),
            );
          });
        toast.success(
          payload.healthy ? 'Worktree 校验通过' : 'Worktree 校验已更新',
        );
      },
      value: {
        id: selectedRepository.id,
        isDefault: selectedRepository.isDefault,
        repoPath: selectedRepository.repoPath,
        sourceUrl: selectedRepository.sourceUrl,
        title: selectedRepository.title,
      },
      worktrees,
      worktreesLoading,
    }),
    [
      codebasesResource,
      repositoryOptions,
      selectedCodebaseState,
      selectedProjectId,
      selectedRepository,
      worktrees,
      worktreesLoading,
    ],
  );

  const homePromptFooterStart = (
    <>
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
    </>
  );

  const homePromptInputProps = {
    ariaLabel: '项目指令输入框',
    disabled: startingSession,
    footerStart: homePromptFooterStart,
    model: {
      onValueChange: setSelectedModelId,
      value: selectedModelId,
    },
    onSubmit: submitHomePrompt,
    placeholder: '你想在这个项目里完成什么？可以直接描述需求、约束和期望结果。',
    project: projectPicker,
    provider: {
      loading: providersLoading,
      onValueChange: setSelectedProviderId,
      providers,
      value: selectedProviderId,
    },
    submitPending: startingSession,
  };

  return (
    <div className="min-w-0 bg-[#fafafa] p-4 md:p-6 dark:bg-[#0a0c12]">
      <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center gap-6 py-4 md:gap-8 md:py-8">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              项目
            </p>
            <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900 md:text-xl dark:text-slate-100">
              {projectTitle(selectedProject)}
            </h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 rounded-xl px-3 text-xs"
            onClick={() => setProviderSheetOpen(true)}
          >
            <DownloadIcon className="size-4" />
            Agents
          </Button>
        </div>

        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
            <span className="size-2 rounded-full bg-blue-500 ring-4 ring-blue-500/15" />
            发起会话
          </div>
          <p className="mx-auto mb-4 max-w-xl text-center text-sm leading-6 text-gray-500 dark:text-gray-400">
            输入首条指令后，会自动创建会话并进入项目协作。
          </p>
          <div id="home-input-container">
            <ProjectComposerInput {...homePromptInputProps} />
          </div>

          <div className="mt-2 px-1 text-[10px] text-slate-400 dark:text-slate-500">
            {sessionAgentDescription(agentType, homeAgentOptions)}
          </div>
        </div>

        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
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
                {recentSessions.map((session) => {
                  const agentLabel = sessionAgentLabel(
                    session.data.specialistId,
                    homeAgentOptions,
                  );
                  const sessionCodebase = session.data.codebase
                    ? repositoryOptions.find(
                        (repository) =>
                          repository.id === session.data.codebase?.id,
                      )
                    : null;

                  return (
                    <button
                      key={session.data.id}
                      type="button"
                      onClick={() =>
                        navigate(
                          `/projects/${selectedProjectId}/sessions/${session.data.id}`,
                        )
                      }
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
                            {agentLabel ? (
                              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                                {agentLabel}
                              </span>
                            ) : null}
                            {sessionCodebase ? (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                                {sessionCodebase.title}
                              </span>
                            ) : null}
                            {session.data.worktree ? (
                              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                                {session.data.worktree.id}
                              </span>
                            ) : null}
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {sessionStateLabel(session.data.acpStatus)}
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
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <Dialog open={providerSheetOpen} onOpenChange={setProviderSheetOpen}>
        <DialogContent className="flex h-[min(820px,calc(100vh-2rem))] min-h-0 w-[min(960px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0">
          <AgentInstallPanel
            installingProviderId={installingProviderId}
            loading={providersLoading}
            onInstall={install}
            onReload={reloadProviders}
            platform={
              typeof navigator !== 'undefined' ? navigator.platform : null
            }
            providers={providers}
            registryError={registryError}
            runtimeAvailability={{ npx: true, uvx: true }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ShellsSessions;
