import { State } from '@hateoas-ts/resource';
import { Project } from '@shared/schema';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ScrollArea,
  Separator,
  Skeleton,
  toast,
} from '@shared/ui';
import { runtimeFetch } from '@shared/util-http';
import { projectTitle, useProjectSelection } from '@shells/sessions';
import {
  CircleAlertIcon,
  ExternalLinkIcon,
  KanbanSquareIcon,
  MoreHorizontalIcon,
  RefreshCcwIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface KanbanBoardListResponse {
  _embedded?: {
    boards?: Array<{
      id: string;
    }>;
  };
}

interface KanbanBoardResponse {
  columns: KanbanColumn[];
  id: string;
  name: string;
  projectId: string;
}

interface KanbanColumn {
  automation: {
    autoAdvanceOnSuccess: boolean;
    enabled: boolean;
  } | null;
  cards?: KanbanCard[];
  id: string;
  name: string;
  position: number;
  stage: string | null;
}

interface KanbanCard {
  assignedRole: string | null;
  assignedSpecialistName: string | null;
  columnId: string | null;
  executionSessionId: string | null;
  id: string;
  kind: string | null;
  lastSyncError: string | null;
  position: number | null;
  priority: string | null;
  resultSessionId: string | null;
  status: string;
  title: string;
  triggerSessionId: string | null;
  updatedAt: string;
  verificationVerdict: string | null;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'unknown';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatCardKindLabel(kind: string | null) {
  switch (kind) {
    case 'plan':
      return 'Plan';
    case 'implement':
      return 'Implement';
    case 'review':
      return 'Review';
    case 'verify':
      return 'Verify';
    default:
      return 'Task';
  }
}

function formatCardStatusLabel(status: string) {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'READY':
      return 'Ready';
    case 'RUNNING':
      return 'Running';
    case 'WAITING_RETRY':
      return 'Blocked';
    case 'COMPLETED':
      return 'Completed';
    case 'FAILED':
      return 'Failed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

function resolveCardSessionId(card: KanbanCard | null) {
  return (
    card?.triggerSessionId ??
    card?.executionSessionId ??
    card?.resultSessionId ??
    null
  );
}

export default function ProjectKanbanPage() {
  const navigate = useNavigate();
  const { projects, selectedProject } = useProjectSelection();
  const currentProject = selectedProject;
  const projectState = currentProject as State<Project> | undefined;
  const [board, setBoard] = useState<KanbanBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [movingCardId, setMovingCardId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    if (!projectState) {
      setBoard(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const listResponse = await runtimeFetch(
        `/api/projects/${projectState.data.id}/kanban/boards`,
      );
      if (!listResponse.ok) {
        throw new Error(`加载看板列表失败: ${listResponse.status}`);
      }

      const listPayload = (await listResponse.json()) as KanbanBoardListResponse;
      const boardId = listPayload._embedded?.boards?.[0]?.id;
      if (!boardId) {
        setBoard(null);
        return;
      }

      const boardResponse = await runtimeFetch(
        `/api/projects/${projectState.data.id}/kanban/boards/${boardId}`,
      );
      if (!boardResponse.ok) {
        throw new Error(`加载看板失败: ${boardResponse.status}`);
      }

      setBoard((await boardResponse.json()) as KanbanBoardResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载看板失败';
      toast.error(message);
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, [projectState]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const cards = useMemo(
    () => board?.columns.flatMap((column) => column.cards ?? []) ?? [],
    [board],
  );
  const selectedCard =
    cards.find((card) => card.id === selectedCardId) ?? cards[0] ?? null;

  useEffect(() => {
    if (!selectedCard) {
      setSelectedCardId(null);
      return;
    }

    setSelectedCardId(selectedCard.id);
  }, [selectedCard]);

  const handleMoveCard = useCallback(
    async (card: KanbanCard, column: KanbanColumn) => {
      if (!board || movingCardId) {
        return;
      }

      setMovingCardId(card.id);

      try {
        const response = await runtimeFetch(`/api/tasks/${card.id}/move`, {
          body: JSON.stringify({
            boardId: board.id,
            columnId: column.id,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        });
        if (!response.ok) {
          throw new Error(`移动卡片失败: ${response.status}`);
        }

        toast.success(`已移动到 ${column.name}`);
        await loadBoard();
      } catch (error) {
        const message = error instanceof Error ? error.message : '移动卡片失败';
        toast.error(message);
      } finally {
        setMovingCardId(null);
      }
    },
    [board, loadBoard, movingCardId],
  );

  if (projects.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Project Kanban</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            当前还没有本地项目。
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentProject || !projectState) {
    return null;
  }

  const selectedSessionId = resolveCardSessionId(selectedCard);

  return (
    <div className="flex h-[100dvh] min-w-0 flex-col bg-background">
      <div className="border-b border-border/60 px-4 py-4 md:px-6">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <KanbanSquareIcon className="size-4" />
              Project Kanban
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {projectTitle(currentProject)}
              {board ? ` · ${board.name}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadBoard()}>
              <RefreshCcwIcon className="mr-1.5 size-3.5" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${projectState.data.id}/orchestration`}>
                Orchestration
              </Link>
            </Button>
            {selectedSessionId ? (
              <Button
                size="sm"
                onClick={() =>
                  navigate(
                    `/projects/${projectState.data.id}/sessions/${selectedSessionId}`,
                  )
                }
              >
                Open Session
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 gap-4 px-4 py-4 md:px-6">
        <div className="min-w-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="grid h-full gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Card key={`kanban-skeleton-${index}`} className="rounded-2xl">
                  <CardHeader>
                    <Skeleton className="h-5 w-24" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !board ? (
            <Card className="rounded-2xl">
              <CardContent className="p-6 text-sm text-muted-foreground">
                当前项目没有可用看板。
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-full">
              <div className="flex min-h-full gap-4 pb-4">
                {board.columns.map((column) => (
                  <Card
                    key={column.id}
                    className="flex min-h-[calc(100dvh-11rem)] w-[320px] shrink-0 flex-col rounded-2xl border-border/70 shadow-none"
                  >
                    <CardHeader className="space-y-3 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-base">{column.name}</CardTitle>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {column.cards?.length ?? 0} cards
                          </p>
                        </div>
                        <Badge variant="outline">
                          {column.automation?.enabled
                            ? column.automation.autoAdvanceOnSuccess
                              ? 'auto'
                              : 'manual'
                            : 'idle'}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                      {(column.cards ?? []).length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                          当前列还没有卡片。
                        </div>
                      ) : (
                        column.cards?.map((card) => (
                          <button
                            key={card.id}
                            type="button"
                            className={`rounded-xl border p-3 text-left transition-colors ${
                              selectedCard?.id === card.id
                                ? 'border-primary bg-primary/5'
                                : 'border-border/60 bg-muted/20 hover:border-border hover:bg-muted/30'
                            }`}
                            onClick={() => setSelectedCardId(card.id)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="line-clamp-2 text-sm font-medium">
                                  {card.title}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <Badge variant="secondary" className="text-[10px]">
                                    {formatCardKindLabel(card.kind)}
                                  </Badge>
                                  <Badge variant="secondary" className="text-[10px]">
                                    {formatCardStatusLabel(card.status)}
                                  </Badge>
                                  {card.assignedRole ? (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px]"
                                    >
                                      {card.assignedRole}
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 shrink-0"
                                    disabled={movingCardId === card.id}
                                  >
                                    <MoreHorizontalIcon className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  {board.columns
                                    .filter((targetColumn) => targetColumn.id !== column.id)
                                    .map((targetColumn) => (
                                      <DropdownMenuItem
                                        key={`${card.id}-${targetColumn.id}`}
                                        onClick={() =>
                                          void handleMoveCard(card, targetColumn)
                                        }
                                      >
                                        Move to {targetColumn.name}
                                      </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            {card.assignedSpecialistName ? (
                              <p className="mt-3 text-xs text-muted-foreground">
                                {card.assignedSpecialistName}
                              </p>
                            ) : null}

                            {card.lastSyncError ? (
                              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                                <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                                <span className="line-clamp-2">{card.lastSyncError}</span>
                              </div>
                            ) : null}
                          </button>
                        ))
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <Card className="hidden w-[320px] shrink-0 rounded-2xl border-border/70 shadow-none lg:flex lg:flex-col">
          <CardHeader>
            <CardTitle className="text-base">Card Details</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
            {!selectedCard ? (
              <div className="text-sm text-muted-foreground">
                选择一张卡片查看详情。
              </div>
            ) : (
              <ScrollArea className="h-full pr-3">
                <div className="space-y-4">
                  <div>
                    <div className="text-lg font-semibold">{selectedCard.title}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">
                        {formatCardKindLabel(selectedCard.kind)}
                      </Badge>
                      <Badge variant="secondary">
                        {formatCardStatusLabel(selectedCard.status)}
                      </Badge>
                      {selectedCard.verificationVerdict ? (
                        <Badge variant="outline">
                          {selectedCard.verificationVerdict}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <Separator />

                  <DetailRow
                    label="Specialist"
                    value={
                      selectedCard.assignedSpecialistName ??
                      selectedCard.assignedRole ??
                      'Unassigned'
                    }
                  />
                  <DetailRow
                    label="Priority"
                    value={selectedCard.priority ?? 'None'}
                  />
                  <DetailRow
                    label="Updated"
                    value={formatDateTime(selectedCard.updatedAt)}
                  />
                  <DetailRow
                    label="Position"
                    value={
                      selectedCard.position === null
                        ? 'Unordered'
                        : String(selectedCard.position)
                    }
                  />
                  <DetailRow
                    label="Execution"
                    value={selectedCard.executionSessionId ?? 'None'}
                  />
                  <DetailRow
                    label="Result"
                    value={selectedCard.resultSessionId ?? 'None'}
                  />
                  <DetailRow
                    label="Trigger"
                    value={selectedCard.triggerSessionId ?? 'None'}
                  />

                  {selectedCard.lastSyncError ? (
                    <>
                      <Separator />
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Last Error
                        </div>
                        <p className="mt-2 text-sm leading-6 text-foreground">
                          {selectedCard.lastSyncError}
                        </p>
                      </div>
                    </>
                  ) : null}

                  {selectedSessionId ? (
                    <>
                      <Separator />
                      <Button
                        className="w-full"
                        onClick={() =>
                          navigate(
                            `/projects/${projectState.data.id}/sessions/${selectedSessionId}`,
                          )
                        }
                      >
                        Open Session
                        <ExternalLinkIcon className="ml-1.5 size-3.5" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DetailRow(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}
