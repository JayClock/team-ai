import { State } from '@hateoas-ts/resource';
import { Project } from '@shared/schema';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  ScrollArea,
  Separator,
  toast,
} from '@shared/ui';
import { runtimeFetch } from '@shared/util-http';
import { projectTitle, useProjectSelection } from '@shells/sessions';
import { ArrowLeftIcon, PlusIcon, RefreshCcwIcon, Settings2Icon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

type ColumnStage = 'backlog' | 'todo' | 'dev' | 'review' | 'blocked' | 'done' | '';

interface BoardListResponse {
  _embedded?: {
    boards?: Array<{
      id: string;
      name: string;
      settings: {
        boardConcurrency: number | null;
        isDefault: boolean;
        wipLimit: number | null;
      };
    }>;
  };
}

interface BoardResponse {
  columns: Array<{
    automation: {
      autoAdvanceOnSuccess: boolean;
      enabled: boolean;
      provider: string | null;
      requiredArtifacts: string[];
      role: string | null;
      specialistId: string | null;
      specialistName: string | null;
      transitionType: 'both' | 'entry' | 'exit';
    } | null;
    cards?: unknown[];
    id: string;
    name: string;
    position: number;
    stage: ColumnStage | null;
  }>;
  id: string;
  name: string;
  projectId: string;
  settings: {
    boardConcurrency: number | null;
    isDefault: boolean;
    wipLimit: number | null;
  };
}

interface SpecialistListResponse {
  _embedded?: {
    specialists?: Array<{
      defaultAdapter: string | null;
      id: string;
      name: string;
      role: string;
      source: {
        scope: string;
      };
    }>;
  };
}

interface ColumnDraft {
  autoAdvanceOnSuccess: boolean;
  enabled: boolean;
  id: string;
  name: string;
  position: number;
  provider: string;
  requiredArtifacts: string;
  role: string;
  specialistId: string;
  specialistName: string;
  stage: ColumnStage;
  transitionType: 'both' | 'entry' | 'exit';
}

function toColumnDraft(column: BoardResponse['columns'][number]): ColumnDraft {
  return {
    autoAdvanceOnSuccess: column.automation?.autoAdvanceOnSuccess ?? false,
    enabled: column.automation?.enabled ?? false,
    id: column.id,
    name: column.name,
    position: column.position,
    provider: column.automation?.provider ?? '',
    requiredArtifacts: column.automation?.requiredArtifacts.join(', ') ?? '',
    role: column.automation?.role ?? '',
    specialistId: column.automation?.specialistId ?? '',
    specialistName: column.automation?.specialistName ?? '',
    stage: (column.stage ?? '') as ColumnStage,
    transitionType: column.automation?.transitionType ?? 'entry',
  };
}

export default function ProjectKanbanSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { projects, selectedProject } = useProjectSelection();
  const currentProject = useMemo(() => {
    return (
      projects.find((project) => project.data.id === projectId) ?? selectedProject ?? null
    ) as State<Project> | null;
  }, [projectId, projects, selectedProject]);
  const [boards, setBoards] = useState<
    Array<{ id: string; name: string; settings: BoardResponse['settings'] }>
  >([]);
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [boardName, setBoardName] = useState('');
  const [boardConcurrency, setBoardConcurrency] = useState('');
  const [wipLimit, setWipLimit] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [columnDrafts, setColumnDrafts] = useState<ColumnDraft[]>([]);
  const [newBoardName, setNewBoardName] = useState('');
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnStage, setNewColumnStage] = useState<ColumnStage>('todo');
  const [loading, setLoading] = useState(true);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [specialists, setSpecialists] = useState<
    Array<{
      defaultAdapter: string | null;
      id: string;
      name: string;
      role: string;
      scope: string;
    }>
  >([]);

  const loadBoard = useCallback(
    async (boardId: string) => {
      if (!projectId) {
        return;
      }

      const response = await runtimeFetch(
        `/api/projects/${projectId}/kanban/boards/${boardId}`,
      );
      if (!response.ok) {
        throw new Error(`加载 board 失败: ${response.status}`);
      }

      const payload = (await response.json()) as BoardResponse;
      setBoard(payload);
      setBoardName(payload.name);
      setBoardConcurrency(
        payload.settings.boardConcurrency === null
          ? ''
          : String(payload.settings.boardConcurrency),
      );
      setWipLimit(
        payload.settings.wipLimit === null ? '' : String(payload.settings.wipLimit),
      );
      setIsDefault(payload.settings.isDefault);
      setColumnDrafts(payload.columns.map(toColumnDraft));
      setSelectedBoardId(payload.id);
    },
    [projectId],
  );

  const loadBoards = useCallback(async () => {
    if (!projectId) {
      setBoards([]);
      setBoard(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await runtimeFetch(`/api/projects/${projectId}/kanban/boards`);
      if (!response.ok) {
        throw new Error(`加载 boards 失败: ${response.status}`);
      }

      const payload = (await response.json()) as BoardListResponse;
      const nextBoards = payload._embedded?.boards ?? [];
      setBoards(nextBoards);
      const nextBoardId =
        selectedBoardId && nextBoards.some((entry) => entry.id === selectedBoardId)
          ? selectedBoardId
          : nextBoards[0]?.id ?? null;
      if (nextBoardId) {
        await loadBoard(nextBoardId);
      } else {
        setBoard(null);
        setSelectedBoardId(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载看板设置失败';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [loadBoard, projectId, selectedBoardId]);

  const loadSpecialists = useCallback(async () => {
    if (!projectId) {
      setSpecialists([]);
      return;
    }

    const response = await runtimeFetch(`/api/projects/${projectId}/specialists`);
    if (!response.ok) {
      throw new Error(`加载 specialists 失败: ${response.status}`);
    }

    const payload = (await response.json()) as SpecialistListResponse;
    setSpecialists(
      (payload._embedded?.specialists ?? []).map((specialist) => ({
        defaultAdapter: specialist.defaultAdapter,
        id: specialist.id,
        name: specialist.name,
        role: specialist.role,
        scope: specialist.source.scope,
      })),
    );
  }, [projectId]);

  useEffect(() => {
    void Promise.all([loadBoards(), loadSpecialists()]).catch((error) => {
      toast.error(error instanceof Error ? error.message : '加载看板设置失败');
    });
  }, [loadBoards, loadSpecialists]);

  const saveBoard = useCallback(async () => {
    if (!projectId || !board) {
      return;
    }

    const response = await runtimeFetch(
      `/api/projects/${projectId}/kanban/boards/${board.id}`,
      {
        body: JSON.stringify({
          isDefault,
          name: boardName,
          settings: {
            boardConcurrency:
              boardConcurrency.trim() === '' ? null : Number(boardConcurrency),
            wipLimit: wipLimit.trim() === '' ? null : Number(wipLimit),
          },
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      },
    );
    if (!response.ok) {
      throw new Error(`保存 board 失败: ${response.status}`);
    }

    toast.success('Board 设置已保存');
    await loadBoards();
  }, [board, boardConcurrency, boardName, isDefault, loadBoards, projectId, wipLimit]);

  const createBoard = useCallback(async () => {
    if (!projectId || !newBoardName.trim()) {
      return;
    }

    const response = await runtimeFetch(`/api/projects/${projectId}/kanban/boards`, {
      body: JSON.stringify({
        name: newBoardName.trim(),
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`创建 board 失败: ${response.status}`);
    }

    const created = (await response.json()) as BoardResponse;
    setNewBoardName('');
    toast.success('Board 已创建');
    await loadBoards();
    await loadBoard(created.id);
  }, [loadBoard, loadBoards, newBoardName, projectId]);

  const saveColumn = useCallback(
    async (column: ColumnDraft) => {
      if (!projectId || !board) {
        return;
      }

      const response = await runtimeFetch(
        `/api/projects/${projectId}/kanban/boards/${board.id}/columns/${column.id}`,
        {
          body: JSON.stringify({
            automation: {
              autoAdvanceOnSuccess: column.autoAdvanceOnSuccess,
              enabled: column.enabled,
              provider: column.provider || null,
              requiredArtifacts: column.requiredArtifacts
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
              role: column.role || null,
              specialistId: column.specialistId || null,
              specialistName: column.specialistName || null,
              transitionType: column.transitionType,
            },
            name: column.name,
            position: column.position,
            stage: column.stage || null,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'PATCH',
        },
      );
      if (!response.ok) {
        throw new Error(`保存列失败: ${response.status}`);
      }

      toast.success(`已保存列 ${column.name}`);
      await loadBoard(board.id);
      await loadBoards();
    },
    [board, loadBoard, loadBoards, projectId],
  );

  const createColumn = useCallback(async () => {
    if (!projectId || !board || !newColumnName.trim()) {
      return;
    }

    const response = await runtimeFetch(
      `/api/projects/${projectId}/kanban/boards/${board.id}/columns`,
      {
        body: JSON.stringify({
          name: newColumnName.trim(),
          stage: newColumnStage || null,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    );
    if (!response.ok) {
      throw new Error(`新增列失败: ${response.status}`);
    }

    setNewColumnName('');
    setNewColumnStage('todo');
    toast.success('列已新增');
    await loadBoard(board.id);
  }, [board, loadBoard, newColumnName, newColumnStage, projectId]);

  const deleteColumn = useCallback(
    async (columnId: string) => {
      if (!projectId || !board) {
        return;
      }

      const response = await runtimeFetch(
        `/api/projects/${projectId}/kanban/boards/${board.id}/columns/${columnId}`,
        {
          method: 'DELETE',
        },
      );
      if (!response.ok) {
        throw new Error(`删除列失败: ${response.status}`);
      }

      toast.success('列已删除');
      await loadBoard(board.id);
    },
    [board, loadBoard, projectId],
  );

  if (!currentProject) {
    return null;
  }

  return (
    <div className="flex h-[100dvh] min-w-0 flex-col bg-background">
      <div className="border-b border-border/60 px-4 py-4 md:px-6">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Settings2Icon className="size-4" />
              Board Settings
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {projectTitle(currentProject)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${currentProject.data.id}/kanban`}>
                <ArrowLeftIcon className="mr-1.5 size-3.5" />
                Back to Kanban
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void loadBoards()}>
              <RefreshCcwIcon className="mr-1.5 size-3.5" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 gap-4 px-4 py-4 md:px-6">
        <Card className="w-[300px] shrink-0 rounded-2xl border-border/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Boards</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="New board name"
                value={newBoardName}
                onChange={(event) => setNewBoardName(event.target.value)}
              />
              <Button size="sm" onClick={() => void createBoard()}>
                <PlusIcon className="size-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {boards.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className={`w-full rounded-xl border px-3 py-2 text-left ${
                    selectedBoardId === entry.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border/60 bg-muted/20'
                  }`}
                  onClick={() => void loadBoard(entry.id)}
                >
                  <div className="text-sm font-medium">{entry.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {entry.settings.isDefault ? 'default board' : 'custom board'}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0 flex-1">
          {loading ? (
            <Card className="rounded-2xl">
              <CardContent className="p-6 text-sm text-muted-foreground">
                正在加载 board 设置...
              </CardContent>
            </Card>
          ) : !board ? (
            <Card className="rounded-2xl">
              <CardContent className="p-6 text-sm text-muted-foreground">
                当前项目还没有可配置 board。
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-4 pb-6">
                <Card className="rounded-2xl border-border/70 shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Board Metadata</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <label className="space-y-2 text-sm">
                        <span className="text-muted-foreground">Name</span>
                        <Input
                          value={boardName}
                          onChange={(event) => setBoardName(event.target.value)}
                        />
                      </label>
                      <label className="space-y-2 text-sm">
                        <span className="text-muted-foreground">
                          Board Concurrency
                        </span>
                        <Input
                          value={boardConcurrency}
                          onChange={(event) =>
                            setBoardConcurrency(event.target.value)
                          }
                        />
                      </label>
                      <label className="space-y-2 text-sm">
                        <span className="text-muted-foreground">WIP Limit</span>
                        <Input
                          value={wipLimit}
                          onChange={(event) => setWipLimit(event.target.value)}
                        />
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isDefault}
                        onChange={(event) => setIsDefault(event.target.checked)}
                      />
                      Set as default board
                    </label>
                    <Button onClick={() => void saveBoard()}>Save Board</Button>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-border/70 shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Columns</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2 md:grid-cols-[2fr,1fr,auto]">
                      <Input
                        placeholder="New column name"
                        value={newColumnName}
                        onChange={(event) => setNewColumnName(event.target.value)}
                      />
                      <select
                        className="h-9 rounded-md border border-border/60 bg-background px-3 text-sm"
                        value={newColumnStage}
                        onChange={(event) =>
                          setNewColumnStage(event.target.value as ColumnStage)
                        }
                      >
                        <option value="">Custom</option>
                        <option value="backlog">Backlog</option>
                        <option value="todo">Todo</option>
                        <option value="dev">Dev</option>
                        <option value="review">Review</option>
                        <option value="blocked">Blocked</option>
                        <option value="done">Done</option>
                      </select>
                      <Button onClick={() => void createColumn()}>
                        <PlusIcon className="mr-1.5 size-4" />
                        Add Column
                      </Button>
                    </div>

                    {columnDrafts.map((column, index) => (
                      <div
                        key={column.id}
                        className="rounded-2xl border border-border/60 bg-muted/20 p-4"
                      >
                        <div className="grid gap-3 md:grid-cols-3">
                          <label className="space-y-2 text-sm">
                            <span className="text-muted-foreground">Name</span>
                            <Input
                              value={column.name}
                              onChange={(event) =>
                                setColumnDrafts((current) =>
                                  current.map((entry) =>
                                    entry.id === column.id
                                      ? { ...entry, name: event.target.value }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="space-y-2 text-sm">
                            <span className="text-muted-foreground">Stage</span>
                            <select
                              className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
                              value={column.stage}
                              onChange={(event) =>
                                setColumnDrafts((current) =>
                                  current.map((entry) =>
                                    entry.id === column.id
                                      ? {
                                          ...entry,
                                          stage: event.target.value as ColumnStage,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            >
                              <option value="">Custom</option>
                              <option value="backlog">Backlog</option>
                              <option value="todo">Todo</option>
                              <option value="dev">Dev</option>
                              <option value="review">Review</option>
                              <option value="blocked">Blocked</option>
                              <option value="done">Done</option>
                            </select>
                          </label>
                          <label className="space-y-2 text-sm">
                            <span className="text-muted-foreground">Position</span>
                            <Input
                              value={String(column.position)}
                              onChange={(event) =>
                                setColumnDrafts((current) =>
                                  current.map((entry) =>
                                    entry.id === column.id
                                      ? {
                                          ...entry,
                                          position: Number(event.target.value || index),
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </label>
                        </div>

                        <Separator className="my-4" />

                        <div className="grid gap-3 md:grid-cols-3">
                          <label className="space-y-2 text-sm">
                            <span className="text-muted-foreground">Role</span>
                            <Input
                              value={column.role}
                              onChange={(event) =>
                                setColumnDrafts((current) =>
                                  current.map((entry) =>
                                    entry.id === column.id
                                      ? { ...entry, role: event.target.value }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="space-y-2 text-sm">
                            <span className="text-muted-foreground">
                              Specialist
                            </span>
                            <select
                              aria-label={`Specialist for ${column.name}`}
                              className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
                              value={column.specialistId}
                              onChange={(event) =>
                                setColumnDrafts((current) =>
                                  current.map((entry) =>
                                    entry.id === column.id
                                      ? {
                                          ...entry,
                                          provider:
                                            specialists.find(
                                              (specialist) =>
                                                specialist.id === event.target.value,
                                            )?.defaultAdapter ?? entry.provider,
                                          role:
                                            specialists.find(
                                              (specialist) =>
                                                specialist.id === event.target.value,
                                            )?.role ?? entry.role,
                                          specialistId: event.target.value,
                                          specialistName:
                                            specialists.find(
                                              (specialist) =>
                                                specialist.id === event.target.value,
                                            )?.name ?? '',
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            >
                              <option value="">No specialist</option>
                              {specialists.map((specialist) => (
                                <option key={specialist.id} value={specialist.id}>
                                  {specialist.name} ({specialist.id})
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-2 text-sm">
                            <span className="text-muted-foreground">
                              Specialist Name
                            </span>
                            <Input
                              value={column.specialistName}
                              onChange={(event) =>
                                setColumnDrafts((current) =>
                                  current.map((entry) =>
                                    entry.id === column.id
                                      ? {
                                          ...entry,
                                          specialistName: event.target.value,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="space-y-2 text-sm">
                            <span className="text-muted-foreground">Provider</span>
                            <Input
                              value={column.provider}
                              onChange={(event) =>
                                setColumnDrafts((current) =>
                                  current.map((entry) =>
                                    entry.id === column.id
                                      ? { ...entry, provider: event.target.value }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="space-y-2 text-sm">
                            <span className="text-muted-foreground">
                              Required Artifacts
                            </span>
                            <Input
                              value={column.requiredArtifacts}
                              onChange={(event) =>
                                setColumnDrafts((current) =>
                                  current.map((entry) =>
                                    entry.id === column.id
                                      ? {
                                          ...entry,
                                          requiredArtifacts: event.target.value,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="space-y-2 text-sm">
                            <span className="text-muted-foreground">
                              Transition Type
                            </span>
                            <select
                              className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
                              value={column.transitionType}
                              onChange={(event) =>
                                setColumnDrafts((current) =>
                                  current.map((entry) =>
                                    entry.id === column.id
                                      ? {
                                          ...entry,
                                          transitionType: event.target.value as ColumnDraft['transitionType'],
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            >
                              <option value="entry">entry</option>
                              <option value="exit">exit</option>
                              <option value="both">both</option>
                            </select>
                          </label>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-4">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={column.enabled}
                              onChange={(event) =>
                                setColumnDrafts((current) =>
                                  current.map((entry) =>
                                    entry.id === column.id
                                      ? { ...entry, enabled: event.target.checked }
                                      : entry,
                                  ),
                                )
                              }
                            />
                            automation enabled
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={column.autoAdvanceOnSuccess}
                              onChange={(event) =>
                                setColumnDrafts((current) =>
                                  current.map((entry) =>
                                    entry.id === column.id
                                      ? {
                                          ...entry,
                                          autoAdvanceOnSuccess: event.target.checked,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            />
                            auto advance on success
                          </label>
                        </div>

                        <div className="mt-4 flex gap-2">
                          <Button onClick={() => void saveColumn(column)}>
                            Save Column
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => void deleteColumn(column.id)}
                          >
                            Delete Column
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
