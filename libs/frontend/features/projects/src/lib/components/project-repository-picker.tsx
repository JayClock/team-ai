import { Button, toast } from '@shared/ui';
import { runtimeFetch } from '@shared/util-http';
import {
  CheckIcon,
  ChevronDownIcon,
  FolderGit2Icon,
  GitBranchPlusIcon,
  LoaderCircleIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ProjectRepositoryOption = {
  id: string;
  repoPath: string | null;
  sourceUrl: string | null;
  title: string;
};

export type ProjectRepositoryPickerProps = {
  onProjectCloned?: (projectId: string) => Promise<void> | void;
  onProjectSelect?: (projectId: string | null) => void;
  projects: ProjectRepositoryOption[];
  selectedProjectId?: string | null;
};

type PickerTab = 'existing' | 'clone';

type CloneProjectResponse = {
  cloneStatus: 'cloned' | 'reused';
  project: ProjectRepositoryOption;
};

type CloneProjectErrorResponse = {
  detail?: string;
  error?: string;
  message?: string;
};

type DropdownPosition = {
  bottom: number;
  left: number;
  width: number;
};

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

function selectedProjectLabel(project: ProjectRepositoryOption | null): string {
  return project?.title?.trim() || '选择或 clone 仓库';
}

export function ProjectRepositoryPicker(props: ProjectRepositoryPickerProps) {
  const { onProjectCloned, onProjectSelect, projects, selectedProjectId } = props;
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

  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const filteredProjects = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return projects;
    }

    return projects.filter((project) =>
      [project.title, project.sourceUrl, project.repoPath].some((valuePart) =>
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

  const handleProjectSelect = useCallback(
    (projectId: string | null) => {
      onProjectSelect?.(projectId);
      setShowDropdown(false);
      setSearchQuery('');
    },
    [onProjectSelect],
  );

  const handleClone = useCallback(async () => {
    const repositoryUrl = normalizeRepositoryUrl(cloneUrl);
    if (!repositoryUrl || cloning) {
      return;
    }

    setCloning(true);
    setCloneError(null);

    try {
      const response = await runtimeFetch('/api/projects/clone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repositoryUrl }),
      });

      const payload = (await response.json()) as
        | CloneProjectResponse
        | CloneProjectErrorResponse;

      if (!response.ok) {
        const failure = payload as CloneProjectErrorResponse;
        throw new Error(
          failure.detail ?? failure.error ?? failure.message ?? '仓库准备失败',
        );
      }

      const success = payload as CloneProjectResponse;
      const project = success.project;
      if (onProjectCloned) {
        await onProjectCloned(project.id);
      } else {
        onProjectSelect?.(project.id);
      }

      toast.success(
        success.cloneStatus === 'reused'
          ? '已复用本地仓库副本'
          : '仓库已完成 clone',
      );
      setShowDropdown(false);
      setCloneUrl('');
      setSearchQuery('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '仓库准备失败';
      setCloneError(message);
    } finally {
      setCloning(false);
    }
  }, [cloneUrl, cloning, onProjectCloned, onProjectSelect]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        className="flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1c1f2e] dark:hover:text-slate-100"
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
          {selectedProjectLabel(selectedProject)}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-slate-400" />
      </button>

      {selectedProject ? (
        <button
          type="button"
          onClick={() => handleProjectSelect(null)}
          className="ml-1 inline-flex size-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-[#1c1f2e] dark:hover:text-slate-200"
          title="清空仓库选择"
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}

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
                      <input
                        ref={searchInputRef}
                        className="h-9 w-full bg-transparent px-0 text-xs text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
                        onChange={(event) =>
                          setSearchQuery(event.currentTarget.value)
                        }
                        placeholder="搜索仓库，或直接粘贴 GitHub 地址"
                        value={searchQuery}
                      />
                    </div>
                  </div>

                  <div className="max-h-72 overflow-y-auto p-2">
                    {filteredProjects.length > 0 ? (
                      filteredProjects.map((project) => {
                        const selected = selectedProjectId === project.id;

                        return (
                          <button
                            key={project.id}
                            className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
                              selected
                                ? 'bg-sky-50 text-sky-950 dark:bg-sky-900/20 dark:text-sky-100'
                                : 'hover:bg-slate-50 dark:hover:bg-[#1f2233]'
                            }`}
                            onClick={() => handleProjectSelect(project.id)}
                            type="button"
                          >
                            <div className="rounded-lg bg-slate-100 p-2 text-slate-500 dark:bg-[#1f2233] dark:text-slate-400">
                              <FolderGit2Icon className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-2 truncate text-sm font-medium">
                                <span className="truncate">{project.title}</span>
                                {selected ? <CheckIcon className="size-3.5 shrink-0" /> : null}
                              </p>
                              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                {project.sourceUrl ?? '未记录来源地址'}
                              </p>
                              <p className="mt-1 truncate text-[11px] text-slate-400 dark:text-slate-500">
                                {project.repoPath ?? '未记录本地目录'}
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
                    <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                      仓库地址
                    </label>
                    <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 dark:border-[#2a2d3d] dark:bg-[#161922]">
                      <span className="shrink-0 text-[11px] font-mono text-slate-400">
                        github.com/
                      </span>
                      <input
                        ref={cloneInputRef}
                        className="w-full bg-transparent px-1.5 py-2 text-xs font-mono text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
                        onChange={(event) => {
                          setCloneError(null);
                          setCloneUrl(event.currentTarget.value);
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
                        <GitBranchPlusIcon className="size-4" />
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
