import { Collection, Entity, State } from '@hateoas-ts/resource';
import { useClient } from '@hateoas-ts/resource-react';
import { Button, Input, Separator, toast } from '@shared/ui';
import { runtimeFetch } from '@shared/util-http';
import {
  ArrowRightIcon,
  ChevronDownIcon,
  FolderGit2Icon,
  GitBranchPlusIcon,
  Loader2Icon,
  SearchIcon,
  SparklesIcon,
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

type LocalProject = Entity<{
  createdAt: string;
  description: string | null;
  id: string;
  sourceType: 'github' | 'local' | null;
  sourceUrl: string | null;
  title: string;
  updatedAt: string;
  workspaceRoot: string | null;
}>;

type LocalProjectCollection = Entity<Collection<LocalProject>['data']>;

type LocalRoot = Entity<
  {
    capabilities: Record<string, boolean>;
    name: string;
  },
  {
    self: LocalRoot;
    projects: LocalProjectCollection;
  }
>;

type ProjectDocument = {
  createdAt: string;
  description: string | null;
  id: string;
  sourceType: 'github' | 'local' | null;
  sourceUrl: string | null;
  title: string;
  updatedAt: string;
  workspaceRoot: string | null;
};

type CloneProjectResponse = ProjectDocument & {
  cloneStatus: 'cloned' | 'reused';
};

type OrchestrationSessionResponse = {
  id: string;
  title: string;
};

type PickerTab = 'existing' | 'clone';

type DropdownPosition = {
  bottom: number;
  left: number;
  width: number;
};

function normalizeRepositoryUrl(value: string): string {
  return value.trim();
}

function deriveSessionTitle(goal: string): string {
  const normalized = goal.trim().replace(/\s+/gu, ' ');
  if (normalized.length <= 72) {
    return normalized;
  }

  return `${normalized.slice(0, 69).trimEnd()}...`;
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

function upsertProjectList(
  projects: ProjectDocument[],
  nextProject: ProjectDocument,
): ProjectDocument[] {
  const remaining = projects.filter((project) => project.id !== nextProject.id);
  return [nextProject, ...remaining];
}

interface RepositoryPickerProps {
  cloning: boolean;
  loading: boolean;
  onClone: (repositoryUrl: string) => Promise<ProjectDocument>;
  onSelect: (project: ProjectDocument) => void;
  projects: ProjectDocument[];
  value: ProjectDocument | null;
}

function RepositoryPicker({
  cloning,
  loading,
  onClone,
  onSelect,
  projects,
  value,
}: RepositoryPickerProps) {
  const [activeTab, setActiveTab] = useState<PickerTab>('existing');
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneUrl, setCloneUrl] = useState('');
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
        project.title,
        project.sourceUrl,
        project.workspaceRoot,
      ].some((valuePart) =>
        valuePart?.toLowerCase().includes(normalizedQuery),
      ),
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

    setCloneError(null);

    try {
      const project = await onClone(repositoryUrl);
      onSelect(project);
      setShowDropdown(false);
      setCloneUrl('');
      setSearchQuery('');
    } catch (error) {
      setCloneError(error instanceof Error ? error.message : '仓库准备失败');
    }
  }, [cloneUrl, cloning, onClone, onSelect]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        className="flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
        onClick={() => {
          if (showDropdown) {
            setShowDropdown(false);
          } else {
            openDropdown();
          }
        }}
        type="button"
      >
        <FolderGit2Icon className="size-3.5 shrink-0" />
        {value ? (
          <span className="max-w-44 truncate text-slate-800">
            {value.title}
          </span>
        ) : (
          <span>选择或 clone 仓库</span>
        )}
        <ChevronDownIcon className="size-3.5 shrink-0 text-slate-400" />
      </button>

      {showDropdown && dropdownPosition
        ? createPortal(
            <div
              ref={containerRef}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_-24px_rgba(15,23,42,0.45)]"
              style={{
                bottom: dropdownPosition.bottom,
                left: dropdownPosition.left,
                position: 'fixed',
                width: dropdownPosition.width,
                zIndex: 9999,
              }}
            >
              <div className="flex border-b border-slate-100">
                <button
                  className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-xs font-medium transition ${
                    activeTab === 'existing'
                      ? 'bg-slate-50 text-slate-900'
                      : 'text-slate-500 hover:bg-slate-50'
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
                      ? 'bg-slate-50 text-slate-900'
                      : 'text-slate-500 hover:bg-slate-50'
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
                  <div className="border-b border-slate-100 p-3">
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
                      <SearchIcon className="size-3.5 text-slate-400" />
                      <input
                        ref={searchInputRef}
                        className="h-9 flex-1 bg-transparent text-xs text-slate-900 outline-none placeholder:text-slate-400"
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="搜索仓库，或直接粘贴 GitHub 地址"
                        value={searchQuery}
                      />
                    </div>
                  </div>

                  <div className="max-h-72 overflow-y-auto p-2">
                    {loading ? (
                      <div className="flex items-center gap-2 px-3 py-6 text-xs text-slate-500">
                        <Loader2Icon className="size-4 animate-spin" />
                        正在加载仓库...
                      </div>
                    ) : filteredProjects.length > 0 ? (
                      filteredProjects.map((project) => {
                        const selected = value?.id === project.id;

                        return (
                          <button
                            key={project.id}
                            className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
                              selected
                                ? 'bg-sky-50 text-sky-950'
                                : 'hover:bg-slate-50'
                            }`}
                            onClick={() => {
                              onSelect(project);
                              setShowDropdown(false);
                            }}
                            type="button"
                          >
                            <div className="rounded-lg bg-slate-100 p-2 text-slate-500">
                              <FolderGit2Icon className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {project.title}
                              </p>
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {project.sourceUrl ?? '未记录来源地址'}
                              </p>
                              <p className="mt-1 truncate text-[11px] text-slate-400">
                                {project.workspaceRoot ?? '未记录本地目录'}
                              </p>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3 py-6 text-xs text-slate-500">
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
                    <label className="text-[11px] font-medium tracking-[0.14em] text-slate-500 uppercase">
                      Repository URL
                    </label>
                    <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3">
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
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {cloneError}
                    </div>
                  ) : null}

                  <Button
                    className="w-full"
                    disabled={cloning || normalizeRepositoryUrl(cloneUrl).length === 0}
                    onClick={() => void handleClone()}
                    type="button"
                  >
                    {cloning ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" />
                        准备仓库中...
                      </>
                    ) : (
                      <>
                        Clone 仓库
                        <ArrowRightIcon className="size-4" />
                      </>
                    )}
                  </Button>

                  <p className="text-[11px] leading-5 text-slate-500">
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

export default function OrchestrationHome() {
  const client = useClient();
  const navigate = useNavigate();
  const rootResource = useMemo(() => client.go<LocalRoot>('/api'), [client]);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const [loading, setLoading] = useState(true);
  const [preparingRepository, setPreparingRepository] = useState(false);
  const [projects, setProjects] = useState<ProjectDocument[]>([]);
  const [prompt, setPrompt] = useState('');
  const [selectedProject, setSelectedProject] = useState<ProjectDocument | null>(
    null,
  );
  const [startingSession, setStartingSession] = useState(false);

  useEffect(() => {
    let disposed = false;

    async function loadProjects() {
      setLoading(true);

      try {
        const rootState = await rootResource;
        const projectCollection = await rootState.follow('projects').get();
        const nextProjects = (
          projectCollection.collection as Array<State<LocalProject>>
        )
          .map((project) => project.data)
          .filter((project) => Boolean(project.sourceUrl));

        if (disposed) {
          return;
        }

        setProjects(nextProjects);
      } catch (error) {
        if (!disposed) {
          toast.error(
            error instanceof Error ? error.message : '加载仓库失败',
          );
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void loadProjects();

    return () => {
      disposed = true;
    };
  }, [rootResource]);

  useEffect(() => {
    if (selectedProject || projects.length === 0) {
      return;
    }

    setSelectedProject(projects[0] ?? null);
  }, [projects, selectedProject]);

  useEffect(() => {
    const element = promptRef.current;
    if (!element) {
      return;
    }

    element.style.height = '0px';
    element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
  }, [prompt]);

  const stages = useMemo(
    () => [
      ['01', '准备仓库', '将仓库 clone 到本地受管目录，或复用现有副本。'],
      ['02', '规划与实施', '在当前仓库里分析需求并执行改动。'],
      ['03', '验证结果', '在会话结束前检查改动和执行结果。'],
    ],
    [],
  );

  const handleCloneRepository = useCallback(async (repositoryUrl: string) => {
    setPreparingRepository(true);

    try {
      const project = await readJson<CloneProjectResponse>('/api/projects/clone', {
        method: 'POST',
        body: JSON.stringify({
          repositoryUrl,
        }),
      });

      setProjects((current) => upsertProjectList(current, project));
      return project;
    } finally {
      setPreparingRepository(false);
    }
  }, []);

  const handleCreateSession = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const goal = prompt.trim();

      if (!selectedProject?.workspaceRoot) {
        toast.error('请先选择一个本地已准备好的仓库');
        return;
      }

      if (!goal) {
        toast.error('请输入你的需求');
        return;
      }

      setStartingSession(true);

      try {
        const session = await readJson<OrchestrationSessionResponse>(
          '/api/orchestration/sessions',
          {
            method: 'POST',
            body: JSON.stringify({
              goal,
              projectId: selectedProject.id,
              provider: 'codex',
              title: deriveSessionTitle(goal),
              workspaceRoot: selectedProject.workspaceRoot,
            }),
          },
        );

        toast.success(`已启动会话：${session.title}`);
        navigate(`/orchestration/${session.id}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '启动会话失败');
      } finally {
        setStartingSession(false);
      }
    },
    [navigate, prompt, selectedProject],
  );

  const handlePromptKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey) {
        return;
      }

      event.preventDefault();

      if (preparingRepository || startingSession) {
        return;
      }

      event.currentTarget.form?.requestSubmit();
    },
    [preparingRepository, startingSession],
  );

  return (
    <div className="relative min-h-full overflow-hidden bg-[radial-gradient(circle_at_top,#fef3c7_0%,#fff7ed_28%,#ffffff_68%)]">
      <div className="absolute inset-x-0 top-0 h-72 bg-[linear-gradient(135deg,rgba(251,191,36,0.20),rgba(249,115,22,0.08),rgba(255,255,255,0))]" />
      <div className="relative mx-auto flex min-h-full w-full max-w-6xl flex-col gap-10 px-4 py-10 md:px-8 md:py-14">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-xs font-medium tracking-[0.18em] text-amber-700 uppercase backdrop-blur">
            <SparklesIcon className="size-3.5" />
            会话入口
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
              输入需求，附上仓库上下文，然后直接发起一次执行会话。
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
              仓库选择、clone 和发送动作都收敛在同一个输入器里，只保留主流程。
            </p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-3xl">
          <div className="group relative" id="orchestration-home-input">
            <div className="pointer-events-none absolute -inset-1 rounded-[28px] bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-amber-500/20 opacity-0 blur-xl transition-opacity duration-500 group-focus-within:opacity-100" />

            <form
              className="relative overflow-visible rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_60px_-28px_rgba(15,23,42,0.35)] transition-colors group-focus-within:border-amber-300/70"
              onSubmit={handleCreateSession}
            >
              <div className="px-4 pb-2 pt-3 md:px-5 md:pt-4">
                <textarea
                  ref={promptRef}
                  className="max-h-60 min-h-28 w-full resize-none border-0 bg-transparent text-sm leading-7 text-slate-900 outline-none placeholder:text-slate-400 md:text-[15px]"
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={handlePromptKeyDown}
                  placeholder="你想在这个仓库里完成什么？可以直接描述需求、约束和期望结果。"
                  value={prompt}
                />
              </div>

              <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 md:px-5">
                <RepositoryPicker
                  cloning={preparingRepository}
                  loading={loading}
                  onClone={handleCloneRepository}
                  onSelect={setSelectedProject}
                  projects={projects}
                  value={selectedProject}
                />

                <div className="hidden h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-600 sm:flex">
                  Codex
                </div>

                <div className="hidden items-center text-[11px] text-slate-400 md:flex">
                  Enter 发送
                  <span className="mx-2 text-slate-300">&middot;</span>
                  Shift + Enter 换行
                </div>

                <div className="ml-auto flex items-center gap-2">
                  {selectedProject ? (
                    <span className="hidden max-w-44 truncate text-xs text-slate-500 lg:inline">
                      {selectedProject.sourceUrl}
                    </span>
                  ) : null}

                  <Button
                    className="size-9 rounded-xl p-0"
                    disabled={
                      preparingRepository ||
                      startingSession ||
                      !selectedProject ||
                      prompt.trim().length === 0
                    }
                    type="submit"
                  >
                    {preparingRepository || startingSession ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <ArrowRightIcon className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-4xl gap-4 md:grid-cols-3">
          {stages.map(([index, title, description], stepIndex) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 shadow-[0_20px_50px_-42px_rgba(15,23,42,0.35)] backdrop-blur"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500">
                  {index}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {description}
                  </p>
                </div>
              </div>
              {stepIndex < stages.length - 1 ? (
                <Separator className="mt-4 bg-slate-100 md:hidden" />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
