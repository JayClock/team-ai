import type { Database } from 'better-sqlite3';
import { ProblemError } from '@orchestration/runtime-acp';
import type {
  KanbanColumnPayload,
} from '../schemas/kanban';
import type {
  AcpSessionContextPayload,
  SessionKanbanContextPayload,
  SessionRelatedLaneHandoffPayload,
} from '../schemas/session-context';
import type {
  TaskLaneHandoffPayload,
  TaskLaneSessionPayload,
  TaskPayload,
} from '../schemas/task';
import { getAcpSessionById } from './acp-service';
import { getProjectWorktreeById } from './project-worktree-service';
import { listTasks } from './task-service';
import {
  getTaskWorkflowColumnDefinition,
  resolveTaskWorkflowColumnStage,
} from './task-workflow-service';
import {
  deriveKanbanCardMemory,
  listTraceLinksForTask,
} from './kanban-card-memory-service';

interface BoardRow {
  id: string;
  name: string;
}

interface ColumnRow {
  board_id: string;
  id: string;
  name: string;
  position: number;
}

function toTimestamp(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const normalized = new Date(value).getTime();
  return Number.isFinite(normalized) ? normalized : 0;
}

function getTaskRelationScore(task: TaskPayload, sessionId: string): number {
  if (task.triggerSessionId === sessionId) {
    return 50;
  }

  if (task.laneSessions.some((entry) => entry.sessionId === sessionId)) {
    return 40;
  }

  if (
    task.laneHandoffs.some(
      (handoff) =>
        handoff.fromSessionId === sessionId || handoff.toSessionId === sessionId,
    )
  ) {
    return 30;
  }

  if (task.executionSessionId === sessionId || task.resultSessionId === sessionId) {
    return 25;
  }

  if (task.sessionIds.includes(sessionId)) {
    return 20;
  }

  if (task.sessionId === sessionId) {
    return 10;
  }

  return 0;
}

function findTaskForSession(tasks: TaskPayload[], sessionId: string) {
  return tasks
    .filter((task) => getTaskRelationScore(task, sessionId) > 0)
    .sort((left, right) => {
      const scoreDelta =
        getTaskRelationScore(right, sessionId) -
        getTaskRelationScore(left, sessionId);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt);
    })[0];
}

function mapColumnRow(row: ColumnRow): KanbanColumnPayload {
  const stage = resolveTaskWorkflowColumnStage(row.id, row.name);
  const definition = stage ? getTaskWorkflowColumnDefinition(stage) : null;

  return {
    automation: null,
    boardId: row.board_id,
    id: row.id,
    name: row.name,
    position: row.position,
    recommendedRole: definition?.recommendedRole ?? null,
    recommendedSpecialistId: definition?.recommendedSpecialistId ?? null,
    recommendedSpecialistName: definition?.recommendedSpecialistName ?? null,
    stage,
  };
}

function getBoardContext(
  sqlite: Database,
  boardId: string | null,
): { columns: KanbanColumnPayload[]; name: string | null } {
  if (!boardId) {
    return {
      columns: [],
      name: null,
    };
  }

  const board = sqlite
    .prepare(
      `
        SELECT id, name
        FROM project_kanban_boards
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(boardId) as BoardRow | undefined;
  if (!board) {
    return {
      columns: [],
      name: null,
    };
  }

  const columns = sqlite
    .prepare(
      `
        SELECT id, board_id, name, position
        FROM project_kanban_columns
        WHERE board_id = ? AND deleted_at IS NULL
        ORDER BY position ASC, created_at ASC
      `,
    )
    .all(boardId) as ColumnRow[];

  return {
    columns: columns.map(mapColumnRow),
    name: board.name,
  };
}

function getTaskLaneSession(
  task: TaskPayload,
  sessionId: string,
): TaskLaneSessionPayload | null {
  return (
    task.laneSessions.find((entry) => entry.sessionId === sessionId) ?? null
  );
}

function getPreviousLaneSession(
  task: TaskPayload,
  columns: KanbanColumnPayload[],
  currentColumnId: string | null,
): TaskLaneSessionPayload | null {
  if (!currentColumnId) {
    return null;
  }

  const orderedColumns = columns
    .slice()
    .sort((left, right) => left.position - right.position);
  const currentIndex = orderedColumns.findIndex(
    (column) => column.id === currentColumnId,
  );
  if (currentIndex <= 0) {
    return null;
  }

  const previousColumn = orderedColumns[currentIndex - 1];
  for (let index = task.laneSessions.length - 1; index >= 0; index -= 1) {
    const entry = task.laneSessions[index];
    if (entry?.columnId === previousColumn?.id) {
      return entry;
    }
  }

  return null;
}

function enrichHandoff(
  handoff: TaskLaneHandoffPayload,
  laneSessions: TaskLaneSessionPayload[],
  sessionId: string,
): SessionRelatedLaneHandoffPayload {
  const sessionMap = new Map(
    laneSessions.map((entry) => [entry.sessionId, entry]),
  );

  return {
    ...handoff,
    direction: handoff.toSessionId === sessionId ? 'incoming' : 'outgoing',
    fromColumnName: sessionMap.get(handoff.fromSessionId)?.columnName,
    toColumnName: sessionMap.get(handoff.toSessionId)?.columnName,
  };
}

function buildSessionKanbanContext(
  sqlite: Database,
  task: TaskPayload,
  sessionId: string,
  boardName: string | null,
  columns: KanbanColumnPayload[],
): SessionKanbanContextPayload {
  const currentLaneSession = getTaskLaneSession(task, sessionId);
  const currentColumnId = currentLaneSession?.columnId ?? task.columnId ?? null;
  const currentColumnName =
    currentLaneSession?.columnName ??
    columns.find((column) => column.id === currentColumnId)?.name ??
    null;
  const previousLaneSession = getPreviousLaneSession(
    task,
    columns,
    currentColumnId,
  );

  return {
    boardColumns: columns,
    boardId: task.boardId,
    boardName,
    columnId: currentColumnId,
    columnName: currentColumnName,
    currentLaneSession,
    memory: deriveKanbanCardMemory({
      completionSummary: task.completionSummary,
      laneHandoffs: task.laneHandoffs,
      lastSyncError: task.lastSyncError,
      status: task.status,
      verificationReport: task.verificationReport,
      verificationVerdict: task.verificationVerdict,
    }),
    previousLaneSession,
    relatedHandoffs: task.laneHandoffs
      .filter(
        (handoff) =>
          handoff.fromSessionId === sessionId || handoff.toSessionId === sessionId,
      )
      .map((handoff) => enrichHandoff(handoff, task.laneSessions, sessionId))
      .sort(
        (left, right) =>
          toTimestamp(right.requestedAt) - toTimestamp(left.requestedAt),
      ),
    taskId: task.id,
    taskTitle: task.title,
    traceLinks: listTraceLinksForTask(sqlite, task),
    triggerSessionId: task.triggerSessionId,
  };
}

export async function getAcpSessionContext(
  sqlite: Database,
  projectId: string,
  sessionId: string,
): Promise<AcpSessionContextPayload> {
  const session = await getAcpSessionById(sqlite, sessionId);
  if (session.project.id !== projectId) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-session-not-found',
      title: 'ACP Session Not Found',
      status: 404,
      detail: `ACP session ${sessionId} was not found in project ${projectId}`,
    });
  }

  const tasks = await listTasks(sqlite, {
    page: 1,
    pageSize: 500,
    projectId,
  });
  const task = session.task
    ? tasks.items.find((entry) => entry.id === session.task?.id) ?? null
    : findTaskForSession(tasks.items, sessionId) ?? null;

  const board = getBoardContext(sqlite, task?.boardId ?? null);
  const worktreeId = session.worktree?.id ?? task?.worktreeId ?? null;
  const worktree = worktreeId
    ? await getProjectWorktreeById(sqlite, projectId, worktreeId).catch(
        () => null,
      )
    : null;

  return {
    kanban: task
      ? buildSessionKanbanContext(
          sqlite,
          task,
          sessionId,
          board.name,
          board.columns,
        )
      : null,
    projectId,
    session,
    sessionId,
    task,
    worktree,
  };
}
