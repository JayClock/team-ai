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
  Textarea,
  toast,
} from '@shared/ui';
import {
  getCurrentDesktopRuntimeConfig,
  resolveRuntimeApiUrl,
  runtimeFetch,
} from '@shared/util-http';
import { projectTitle, useProjectSelection } from '@shells/sessions';
import {
  CircleAlertIcon,
  ExternalLinkIcon,
  KanbanSquareIcon,
  MoreHorizontalIcon,
  RefreshCcwIcon,
  SparklesIcon,
} from 'lucide-react';
import type { DragEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  settings: {
    boardConcurrency: number | null;
    isDefault: boolean;
    wipLimit: number | null;
  };
}

interface KanbanIntakeResponse {
  archivedTaskIds: string[];
  createdTaskIds: string[];
  decomposition: {
    goal: string;
    tasks: Array<{
      kind: string;
      owner: string;
      title: string;
    }>;
  };
  note: {
    id: string;
    updatedAt: string;
  };
  parsedTaskCount: number;
  specFragment: string;
  updatedTaskIds: string[];
}

interface KanbanColumn {
  automation: {
    allowedSourceColumnIds: string[];
    autoAdvanceOnSuccess: boolean;
    enabled: boolean;
    manualApprovalRequired: boolean;
    provider: string | null;
    requiredArtifacts: string[];
    role: string | null;
    specialistId: string | null;
    specialistName: string | null;
    transitionType: 'both' | 'entry' | 'exit';
  } | null;
  cards?: KanbanCard[];
  id: string;
  name: string;
  position: number;
  recommendedRole: string | null;
  recommendedSpecialistId: string | null;
  recommendedSpecialistName: string | null;
  stage: string | null;
}

interface KanbanCard {
  assignedRole: string | null;
  assignedSpecialistName: string | null;
  artifactEvidence: string[];
  columnId: string | null;
  completionSummary: string | null;
  executionSessionId: string | null;
  explain: {
    currentColumnReason: string;
    decisionLog: string[];
    latestAutomationResult: string | null;
    missingArtifacts: string[];
    recentTransitionReason: string | null;
  } | null;
  githubNumber: number | null;
  githubRepo: string | null;
  githubState: string | null;
  githubUrl: string | null;
  id: string;
  kind: string | null;
  laneHandoffs: Array<{
    artifactEvidence?: string[];
    artifactHints?: string[];
    fromColumnId?: string;
    fromSessionId: string;
    id: string;
    request: string;
    requestType: string;
    requestedAt: string;
    respondedAt?: string;
    responseSummary?: string;
    status: string;
    toColumnId?: string;
    toSessionId: string;
  }>;
  laneSessions: Array<{
    columnId?: string;
    columnName?: string;
    completedAt?: string;
    provider?: string;
    role?: string;
    sessionId: string;
    specialistId?: string;
    specialistName?: string;
    startedAt: string;
    status: string;
  }>;
  lastSyncError: string | null;
  position: number | null;
  priority: string | null;
  recentOutputSummary: string | null;
  resultSessionId: string | null;
  sourceEventId: string | null;
  sourceType: string;
  status: string;
  title: string;
  triggerSessionId: string | null;
  updatedAt: string;
  verificationReport: string | null;
  verificationVerdict: string | null;
}

type KanbanRealtimeEvent =
  | {
      boardId: string;
      fromColumnId: string | null;
      projectId: string;
      taskId: string;
      taskTitle: string;
      toColumnId: string;
      type: 'task.column-transition';
    }
  | {
      backgroundTaskId: string;
      boardId?: string | null;
      projectId: string;
      sessionId: string | null;
      success: boolean;
      taskId: string;
      taskTitle?: string | null;
      type: 'background-task.completed';
    }
  | {
      backgroundTaskId: string;
      boardId?: string | null;
      projectId: string;
      sessionId: string;
      taskId: string;
      taskTitle?: string | null;
      type: 'background-task.session-started';
    }
  | {
      boardId?: string | null;
      projectId: string;
      sessionId: string;
      success: boolean;
      taskId: string;
      taskTitle?: string | null;
      type: 'task.session-completed';
    };

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

function formatLaneSessionLabel(session: KanbanCard['laneSessions'][number]) {
  return (
    session.columnName ??
    session.specialistName ??
    session.sessionId
  );
}

function parseMultilineItems(value: string) {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveCardSessionId(card: KanbanCard | null) {
  return (
    card?.triggerSessionId ??
    card?.executionSessionId ??
    card?.resultSessionId ??
    null
  );
}

function normalizePolicyText(value: string) {
  return value.trim().toLowerCase();
}

function matchesArtifactRequirement(requirement: string, evidence: string) {
  const normalizedRequirement = normalizePolicyText(requirement);
  const normalizedEvidence = normalizePolicyText(evidence);

  if (normalizedEvidence.includes(normalizedRequirement)) {
    return true;
  }

  if (
    (normalizedRequirement.includes('url') ||
      normalizedRequirement.includes('link')) &&
    /(https?:\/\/|localhost|127\.0\.0\.1)/.test(normalizedEvidence)
  ) {
    return true;
  }

  if (
    (normalizedRequirement.includes('screenshot') ||
      normalizedRequirement.includes('image')) &&
    /\.(png|jpg|jpeg|webp|gif)\b/.test(normalizedEvidence)
  ) {
    return true;
  }

  return false;
}

function isWipStage(stage: KanbanColumn['stage']) {
  return stage !== null && stage !== 'backlog' && stage !== 'done';
}

function evaluateLocalMovePolicy(
  board: KanbanBoardResponse,
  card: KanbanCard,
  targetColumn: KanbanColumn,
) {
  const violations: string[] = [];
  const sourceColumn =
    board.columns.find((column) => column.id === card.columnId) ?? null;

  if (
    targetColumn.automation?.allowedSourceColumnIds.length &&
    (!card.columnId ||
      !targetColumn.automation.allowedSourceColumnIds.includes(card.columnId))
  ) {
    violations.push(`Only approved source columns can enter ${targetColumn.name}.`);
  }

  if (targetColumn.automation?.manualApprovalRequired) {
    violations.push(`${targetColumn.name} requires manual approval before moving a card in.`);
  }

  const increasesBoardWip =
    !isWipStage(sourceColumn?.stage ?? null) && isWipStage(targetColumn.stage);
  const activeWip = board.columns.reduce((total, column) => {
    if (!isWipStage(column.stage)) {
      return total;
    }

    return total + (column.cards?.length ?? 0);
  }, 0);
  if (
    increasesBoardWip &&
    typeof board.settings.wipLimit === 'number' &&
    activeWip >= board.settings.wipLimit
  ) {
    violations.push(
      `Board WIP limit reached (${board.settings.wipLimit}). Finish active work before pulling another card forward.`,
    );
  }

  const missingArtifacts = (targetColumn.automation?.requiredArtifacts ?? []).filter(
    (artifact) => {
      return !card.artifactEvidence.some((evidence) => {
        return matchesArtifactRequirement(artifact, evidence);
      });
    },
  );
  if (missingArtifacts.length > 0) {
    violations.push(
      `${targetColumn.name} requires ${missingArtifacts.join(', ')} before the move can complete.`,
    );
  }

  return violations;
}

async function getErrorDetail(response: Response) {
  try {
    const payload = (await response.json()) as { detail?: string; title?: string };
    return payload.detail ?? payload.title ?? `请求失败: ${response.status}`;
  } catch {
    return `请求失败: ${response.status}`;
  }
}

function describeKanbanRealtimeEvent(event: KanbanRealtimeEvent) {
  switch (event.type) {
    case 'task.column-transition':
      return `${event.taskTitle} moved into ${event.toColumnId}`;
    case 'background-task.session-started':
      return `${event.taskTitle ?? event.taskId} started an automation session`;
    case 'background-task.completed':
      return `${event.taskTitle ?? event.taskId} ${
        event.success ? 'completed' : 'failed'
      } in the worker queue`;
    case 'task.session-completed':
      return `${event.taskTitle ?? event.taskId} ${
        event.success ? 'completed' : 'failed'
      } its routed session`;
  }
}

function formatStreamStatusLabel(status: KanbanStreamStatus) {
  switch (status) {
    case 'connecting':
      return 'Live stream connecting';
    case 'live':
      return 'Live stream active';
    case 'reconnecting':
      return 'Live stream reconnecting';
    default:
      return 'Live stream offline';
  }
}

type KanbanStreamStatus = 'idle' | 'connecting' | 'live' | 'reconnecting';

export default function ProjectKanbanPage() {
  const navigate = useNavigate();
  const { projects, selectedProject } = useProjectSelection();
  const currentProject = selectedProject;
  const projectState = currentProject as State<Project> | undefined;
  const [board, setBoard] = useState<KanbanBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [movingCardId, setMovingCardId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    columnId: string;
    position: number;
  } | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakePending, setIntakePending] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const [constraintsDraft, setConstraintsDraft] = useState('');
  const [acceptanceDraft, setAcceptanceDraft] = useState('');
  const [artifactDraft, setArtifactDraft] = useState('');
  const [lastIntake, setLastIntake] = useState<KanbanIntakeResponse | null>(null);
  const [streamStatus, setStreamStatus] = useState<KanbanStreamStatus>('idle');
  const [lastRealtimeEvent, setLastRealtimeEvent] =
    useState<KanbanRealtimeEvent | null>(null);
  const [lastRealtimeEventAt, setLastRealtimeEventAt] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

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

  useEffect(() => {
    if (!projectState || !board?.id) {
      setStreamStatus('idle');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setStreamStatus('connecting');

    const url = new URL(
      resolveRuntimeApiUrl(
        `/api/projects/${projectState.data.id}/kanban/events/stream`,
      ),
    );
    url.searchParams.set('boardId', board.id);

    const desktopRuntimeConfig = getCurrentDesktopRuntimeConfig();
    if (desktopRuntimeConfig) {
      url.searchParams.set(
        'desktopSessionToken',
        desktopRuntimeConfig.desktopSessionToken,
      );
    }

    const source = new EventSource(url.toString(), { withCredentials: true });

    source.addEventListener('connected', () => {
      setStreamStatus('live');
    });

    const onKanbanEvent = (raw: string) => {
      try {
        const parsed = JSON.parse(raw) as KanbanRealtimeEvent;
        setLastRealtimeEvent(parsed);
        setLastRealtimeEventAt(new Date().toISOString());
        setStreamStatus('live');
        void loadBoard();
      } catch {
        // ignore malformed realtime payloads
      }
    };

    source.addEventListener('kanban-event', (event) => {
      onKanbanEvent((event as MessageEvent<string>).data);
    });
    source.onerror = () => {
      setStreamStatus('reconnecting');
    };

    eventSourceRef.current = source;

    return () => {
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
    };
  }, [board?.id, loadBoard, projectState]);

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
    async (
      card: KanbanCard,
      column: KanbanColumn,
      position?: number,
    ) => {
      if (!board || movingCardId) {
        return;
      }

      const localPolicyViolations = evaluateLocalMovePolicy(board, card, column);
      if (localPolicyViolations.length > 0) {
        toast.error(localPolicyViolations[0] ?? 'Kanban policy blocked transition.');
        return;
      }

      setMovingCardId(card.id);

      try {
        const response = await runtimeFetch(`/api/tasks/${card.id}/move`, {
          body: JSON.stringify({
            boardId: board.id,
            columnId: column.id,
            ...(position !== undefined ? { position } : {}),
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        });
        if (!response.ok) {
          throw new Error(await getErrorDetail(response));
        }

        toast.success(`已移动到 ${column.name}`);
        await loadBoard();
      } catch (error) {
        const message = error instanceof Error ? error.message : '移动卡片失败';
        toast.error(message);
      } finally {
        setMovingCardId(null);
        setDraggedCardId(null);
        setDropTarget(null);
      }
    },
    [board, loadBoard, movingCardId],
  );

  const handleIntakeSubmit = useCallback(async () => {
    if (!projectState) {
      return;
    }

    const goal = goalDraft.trim();
    if (!goal) {
      toast.error('请输入要拆解的目标。');
      return;
    }

    setIntakePending(true);

    try {
      const response = await runtimeFetch(
        `/api/projects/${projectState.data.id}/kanban/intake`,
        {
          body: JSON.stringify({
            acceptanceHints: parseMultilineItems(acceptanceDraft),
            artifactHints: parseMultilineItems(artifactDraft),
            constraints: parseMultilineItems(constraintsDraft),
            goal,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );
      if (!response.ok) {
        throw new Error(`生成卡片失败: ${response.status}`);
      }

      const payload = (await response.json()) as KanbanIntakeResponse;
      setLastIntake(payload);
      setGoalDraft('');
      setConstraintsDraft('');
      setAcceptanceDraft('');
      setArtifactDraft('');
      toast.success(
        `已生成 ${payload.parsedTaskCount} 张卡片，新增 ${payload.createdTaskIds.length}，更新 ${payload.updatedTaskIds.length}`,
      );
      await loadBoard();
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成卡片失败';
      toast.error(message);
    } finally {
      setIntakePending(false);
    }
  }, [
    acceptanceDraft,
    artifactDraft,
    constraintsDraft,
    goalDraft,
    loadBoard,
    projectState,
  ]);

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

  const handleDragStart = useCallback(
    (
      event: DragEvent<HTMLDivElement>,
      card: KanbanCard,
    ) => {
      if (card.status === 'RUNNING') {
        const confirmed = window.confirm(
          '这张卡当前处于运行中，确认仍要拖拽移动吗？',
        );
        if (!confirmed) {
          event.preventDefault();
          return;
        }
      }

      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.id);
      setDraggedCardId(card.id);
      setDropTarget(null);
    },
    [],
  );

  const handleDrop = useCallback(
    async (column: KanbanColumn, position: number) => {
      const card = cards.find((entry) => entry.id === draggedCardId);
      if (!card) {
        return;
      }

      await handleMoveCard(card, column, position);
    },
    [cards, draggedCardId, handleMoveCard],
  );

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
              {board?.settings.isDefault ? ' · default board' : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{formatStreamStatusLabel(streamStatus)}</Badge>
              {lastRealtimeEvent ? (
                <span>
                  {describeKanbanRealtimeEvent(lastRealtimeEvent)}
                  {lastRealtimeEventAt
                    ? ` · ${formatDateTime(lastRealtimeEventAt)}`
                    : ''}
                </span>
              ) : (
                <span>自动化进度会通过事件流实时回写到看板。</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIntakeOpen((previous) => !previous)}
            >
              <SparklesIcon className="mr-1.5 size-3.5" />
              New Goal
            </Button>
            <Button variant="outline" size="sm" onClick={() => void loadBoard()}>
              <RefreshCcwIcon className="mr-1.5 size-3.5" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${projectState.data.id}/orchestration`}>
                Orchestration
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${projectState.data.id}/kanban/settings`}>
                Settings
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
          <div className="flex h-full min-h-0 flex-col gap-4">
            {intakeOpen ? (
              <Card className="rounded-2xl border-border/70 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Goal Intake</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    输入自然语言目标，系统会生成 canonical spec 片段并同步成 backlog / todo / review 卡片。
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 xl:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium">Goal</span>
                      <Textarea
                        aria-label="Goal"
                        value={goalDraft}
                        onChange={(event) => setGoalDraft(event.target.value)}
                        placeholder="例如：Build a user authentication flow"
                        className="min-h-24"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium">Constraints</span>
                      <Textarea
                        aria-label="Constraints"
                        value={constraintsDraft}
                        onChange={(event) => setConstraintsDraft(event.target.value)}
                        placeholder={'每行一个约束\n例如：Use the existing auth store'}
                        className="min-h-24"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium">Acceptance Hints</span>
                      <Textarea
                        aria-label="Acceptance Hints"
                        value={acceptanceDraft}
                        onChange={(event) => setAcceptanceDraft(event.target.value)}
                        placeholder={'每行一个验收提示\n例如：Users can log in with email and password'}
                        className="min-h-24"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium">Artifact Hints</span>
                      <Textarea
                        aria-label="Artifact Hints"
                        value={artifactDraft}
                        onChange={(event) => setArtifactDraft(event.target.value)}
                        placeholder={'每行一个证据提示\n例如：login screen screenshot'}
                        className="min-h-24"
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      当前入口会生成 `Refine / Implement / Review` 三张基础卡，并直接同步到看板。
                    </p>
                    <Button
                      size="sm"
                      onClick={() => void handleIntakeSubmit()}
                      disabled={intakePending}
                    >
                      {intakePending ? 'Generating...' : 'Generate Cards'}
                    </Button>
                  </div>

                  {lastIntake ? (
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">Generated Task Drafts</div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            最近一次 intake 已更新 note {lastIntake.note.id}，并同步了 {lastIntake.parsedTaskCount} 张卡片。
                          </p>
                        </div>
                        <Badge variant="outline">
                          {formatDateTime(lastIntake.note.updatedAt)}
                        </Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {lastIntake.decomposition.tasks.map((task) => (
                          <Badge key={task.title} variant="secondary">
                            {task.title}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            <div className="min-h-0 flex-1 overflow-hidden">
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
                              {column.automation?.requiredArtifacts.length ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  requires {column.automation.requiredArtifacts.join(', ')}
                                </p>
                              ) : null}
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
                            <div
                              className={`rounded-xl border border-dashed p-4 text-sm text-muted-foreground ${
                                dropTarget?.columnId === column.id &&
                                dropTarget.position === 0
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border/70 bg-muted/20'
                              }`}
                              onDragOver={(event) => {
                                event.preventDefault();
                                setDropTarget({
                                  columnId: column.id,
                                  position: 0,
                                });
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                void handleDrop(column, 0);
                              }}
                            >
                              当前列还没有卡片。
                            </div>
                          ) : (
                            <>
                              {column.cards?.map((card, index) => (
                                <div key={card.id} className="space-y-2">
                                  <div
                                    className={`h-2 rounded-full border border-dashed transition-colors ${
                                      dropTarget?.columnId === column.id &&
                                      dropTarget.position === index
                                        ? 'border-primary bg-primary/10'
                                        : 'border-transparent'
                                    }`}
                                    onDragOver={(event) => {
                                      event.preventDefault();
                                      setDropTarget({
                                        columnId: column.id,
                                        position: index,
                                      });
                                    }}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      void handleDrop(column, index);
                                    }}
                                  />
                                  <div
                                    draggable
                                    key={card.id}
                                    role="button"
                                    tabIndex={0}
                                    className={`rounded-xl border p-3 text-left transition-colors ${
                                      selectedCard?.id === card.id
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border/60 bg-muted/20 hover:border-border hover:bg-muted/30'
                                    } ${draggedCardId === card.id ? 'opacity-60' : ''}`}
                                    onClick={() => setSelectedCardId(card.id)}
                                    onDragEnd={() => {
                                      setDraggedCardId(null);
                                      setDropTarget(null);
                                    }}
                                    onDragStart={(event) => handleDragStart(event, card)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        setSelectedCardId(card.id);
                                      }
                                    }}
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
                                            aria-label={`Move ${card.title}`}
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
                                  </div>
                                </div>
                              ))}
                              <div
                                className={`h-2 rounded-full border border-dashed transition-colors ${
                                  dropTarget?.columnId === column.id &&
                                  dropTarget.position === (column.cards?.length ?? 0)
                                    ? 'border-primary bg-primary/10'
                                    : 'border-transparent'
                                }`}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  setDropTarget({
                                    columnId: column.id,
                                    position: column.cards?.length ?? 0,
                                  });
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  void handleDrop(column, column.cards?.length ?? 0);
                                }}
                              />
                            </>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
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
                    label="Automation"
                    value={
                      selectedCard.explain?.latestAutomationResult ??
                      'No recent automation summary'
                    }
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
                  <DetailRow
                    label="Source"
                    value={selectedCard.sourceType ?? 'unknown'}
                  />
                  <DetailRow
                    label="External Ref"
                    value={selectedCard.sourceEventId ?? 'None'}
                  />
                  {selectedCard.githubRepo ? (
                    <DetailRow
                      label="GitHub"
                      value={
                        selectedCard.githubNumber
                          ? `${selectedCard.githubRepo} #${selectedCard.githubNumber}`
                          : selectedCard.githubRepo
                      }
                    />
                  ) : null}
                  {selectedCard.githubState ? (
                    <DetailRow
                      label="GitHub State"
                      value={selectedCard.githubState}
                    />
                  ) : null}

                  {selectedCard.explain ? (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Why Here
                          </div>
                          <p className="mt-2 text-sm leading-6 text-foreground">
                            {selectedCard.explain.currentColumnReason}
                          </p>
                        </div>

                        {selectedCard.explain.missingArtifacts.length > 0 ? (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Missing Artifacts
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {selectedCard.explain.missingArtifacts.map((artifact) => (
                                <Badge key={artifact} variant="outline">
                                  {artifact}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {selectedCard.explain.decisionLog.length > 0 ? (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Decision Log
                            </div>
                            <div className="mt-2 space-y-2">
                              {selectedCard.explain.decisionLog.map((entry, index) => (
                                <div
                                  key={`${selectedCard.id}-decision-${index}`}
                                  className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-foreground"
                                >
                                  {entry}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {selectedCard.explain.recentTransitionReason ? (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Recent Context
                            </div>
                            <p className="mt-2 text-sm leading-6 text-foreground">
                              {selectedCard.explain.recentTransitionReason}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  {selectedCard.recentOutputSummary ? (
                    <>
                      <Separator />
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Recent Output
                        </div>
                        <p className="mt-2 text-sm leading-6 text-foreground">
                          {selectedCard.recentOutputSummary}
                        </p>
                      </div>
                    </>
                  ) : null}

                  {selectedCard.artifactEvidence.length > 0 ? (
                    <>
                      <Separator />
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Artifact Evidence
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedCard.artifactEvidence.map((artifact) => (
                            <Badge key={artifact} variant="outline">
                              {artifact}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : null}

                  {selectedCard.laneSessions.length > 0 ? (
                    <>
                      <Separator />
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Lane Sessions
                        </div>
                        <div className="mt-2 space-y-2">
                          {selectedCard.laneSessions.map((session) => (
                            <div
                              key={session.sessionId}
                              className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                            >
                              <div className="text-sm font-medium">
                                {formatLaneSessionLabel(session)}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {session.status} · {formatDateTime(session.startedAt)}
                                {session.completedAt
                                  ? ` -> ${formatDateTime(session.completedAt)}`
                                  : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : null}

                  {selectedCard.laneHandoffs.length > 0 ? (
                    <>
                      <Separator />
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Lane Handoffs
                        </div>
                        <div className="mt-2 space-y-2">
                          {selectedCard.laneHandoffs.map((handoff) => (
                            <div
                              key={handoff.id}
                              className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                            >
                              <div className="text-sm font-medium">
                                {handoff.requestType}
                              </div>
                              <p className="mt-1 text-sm text-foreground">
                                {handoff.request}
                              </p>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {handoff.status} · {formatDateTime(handoff.requestedAt)}
                              </div>
                              {handoff.responseSummary ? (
                                <p className="mt-2 text-sm text-foreground">
                                  {handoff.responseSummary}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : null}

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
