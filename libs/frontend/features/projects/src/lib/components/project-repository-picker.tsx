import {
  Button,
  Card,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@shared/ui';
import { runtimeFetch } from '@shared/util-http';
import {
  CheckIcon,
  ChevronDownIcon,
  FolderGit2Icon,
  GitBranchPlusIcon,
  LoaderCircleIcon,
  SearchIcon,
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
  disabled?: boolean;
  onProjectCloned?: (projectId: string) => Promise<void> | void;
  onValueChange?: (project: ProjectRepositoryOption | null) => void;
  projects: ProjectRepositoryOption[];
  value?: ProjectRepositoryOption | null;
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

export function ProjectRepositoryPicker(props: ProjectRepositoryPickerProps) {
  const { disabled, onProjectCloned, onValueChange, projects, value } = props;
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

  const selectedProject = useMemo(() => {
    if (!value) {
      return null;
    }

    return projects.find((project) => project.id === value.id) ?? value;
  }, [projects, value]);

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
    (project: ProjectRepositoryOption | null) => {
      onValueChange?.(project);
      setShowDropdown(false);
      setSearchQuery('');
    },
    [onValueChange],
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
        onValueChange?.(project);
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
  }, [cloneUrl, cloning, onProjectCloned, onValueChange]);

  return (
    <div className="relative">
      {selectedProject ? (
        <SelectedProjectPill
          disabled={disabled === true}
          project={selectedProject}
          showDropdown={showDropdown}
          triggerRef={triggerRef}
          onToggleDropdown={() => {
            if (disabled) {
              return;
            }
            if (showDropdown) {
              setShowDropdown(false);
              return;
            }

            openDropdown();
          }}
        />
      ) : (
        <Button
          ref={triggerRef}
          className="h-8 max-w-full gap-1.5 px-2.5 text-xs text-slate-600 dark:text-slate-400"
          disabled={disabled === true}
          onClick={() => {
            if (disabled) {
              return;
            }
            if (showDropdown) {
              setShowDropdown(false);
              return;
            }

            openDropdown();
          }}
          type="button"
          variant="ghost"
        >
          <FolderGit2Icon className="size-3.5 shrink-0" />
          <span className="max-w-44 truncate">选择或 clone 仓库</span>
          <ChevronDownIcon className="size-3.5 shrink-0 text-slate-400" />
        </Button>
      )}

      {showDropdown && dropdownPosition
        ? createPortal(
            <Card
              ref={containerRef}
              className="gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white py-0 shadow-[0_24px_70px_-24px_rgba(15,23,42,0.45)] dark:border-[#1c1f2e] dark:bg-[#181b26]"
              style={{
                bottom: dropdownPosition.bottom,
                left: dropdownPosition.left,
                position: 'fixed',
                width: dropdownPosition.width,
                zIndex: 9999,
              }}
            >
              <Tabs
                className="w-full"
                onValueChange={(value) => setActiveTab(value as PickerTab)}
                value={activeTab}
              >
                <div className="border-b border-slate-100 px-3 py-3 dark:border-[#1c1f2e]">
                  <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl bg-slate-100/80 p-1 dark:bg-[#1f2233]">
                    <TabsTrigger
                      className="gap-2 rounded-lg px-3 py-2 text-xs"
                      value="existing"
                    >
                      <FolderGit2Icon className="size-3.5" />
                      已有仓库
                    </TabsTrigger>
                    <TabsTrigger
                      className="gap-2 rounded-lg px-3 py-2 text-xs"
                      value="clone"
                    >
                      <GitBranchPlusIcon className="size-3.5" />
                      Clone 仓库
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent className="mt-0" value="existing">
                  <div className="border-b border-slate-100 p-3 dark:border-[#1c1f2e]">
                    <div className="relative">
                      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                      <Input
                        ref={searchInputRef}
                        className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-xs dark:border-[#2a2d3d] dark:bg-[#161922]"
                        onChange={(event) =>
                          setSearchQuery(event.currentTarget.value)
                        }
                        placeholder="搜索仓库，或直接粘贴 GitHub 地址"
                        value={searchQuery}
                      />
                    </div>
                  </div>

                  <Command className="bg-transparent">
                    <CommandList className="max-h-72 p-2">
                      {filteredProjects.length > 0 ? (
                        <CommandGroup heading="受管仓库">
                          {filteredProjects.map((project) => {
                            const selected = selectedProject?.id === project.id;

                            return (
                              <CommandItem
                                key={project.id}
                                className="items-start rounded-xl px-3 py-3 aria-selected:bg-sky-50 aria-selected:text-sky-950 dark:aria-selected:bg-sky-900/20 dark:aria-selected:text-sky-100"
                                onSelect={() => handleProjectSelect(project)}
                                value={project.id}
                              >
                                <div className="rounded-lg bg-slate-100 p-2 text-slate-500 dark:bg-[#1f2233] dark:text-slate-400">
                                  <FolderGit2Icon className="size-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                                    <span className="truncate">
                                      {project.title}
                                    </span>
                                    {selected ? (
                                      <CheckIcon className="size-3.5 shrink-0" />
                                    ) : null}
                                  </p>
                                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                    {project.sourceUrl ?? '未记录来源地址'}
                                  </p>
                                  <p className="mt-1 truncate text-[11px] font-mono text-slate-400 dark:text-slate-500">
                                    {project.repoPath ?? '未记录本地目录'}
                                  </p>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      ) : (
                        <CommandEmpty className="px-3 py-6 text-xs text-slate-500 dark:text-slate-400">
                          {projects.length === 0
                            ? '还没有已托管仓库，切换到“Clone 仓库”开始。'
                            : '没有匹配的仓库。'}
                        </CommandEmpty>
                      )}
                    </CommandList>
                  </Command>
                </TabsContent>

                <TabsContent className="mt-0 px-3 py-3" value="clone">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        仓库地址
                      </label>
                      <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 dark:border-[#2a2d3d] dark:bg-[#161922]">
                        <span className="shrink-0 text-[11px] font-mono text-slate-400">
                          github.com/
                        </span>
                        <Input
                          ref={cloneInputRef}
                          className="border-0 bg-transparent px-1.5 py-0 text-xs font-mono shadow-none focus-visible:ring-0 dark:bg-transparent"
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
                </TabsContent>
              </Tabs>
            </Card>,
            document.body,
          )
        : null}
    </div>
  );
}

type SelectedProjectPillProps = {
  disabled?: boolean;
  onToggleDropdown: () => void;
  project: ProjectRepositoryOption;
  showDropdown: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

function SelectedProjectPill(props: SelectedProjectPillProps) {
  const { disabled, onToggleDropdown, project, showDropdown, triggerRef } =
    props;

  return (
    <div className="flex max-w-full items-center gap-1.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-[#1f2233] dark:text-slate-400">
        <FolderGit2Icon className="size-3.5" />
      </div>

      <Button
        ref={triggerRef}
        aria-expanded={showDropdown}
        className="h-8 min-w-0 max-w-[220px] gap-1.5 px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200"
        disabled={disabled === true}
        onClick={onToggleDropdown}
        title={project.title}
        type="button"
        variant="ghost"
      >
        <span className="truncate">{project.title}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-slate-400" />
      </Button>
    </div>
  );
}
