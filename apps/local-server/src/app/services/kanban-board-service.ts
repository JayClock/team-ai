import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '@orchestration/runtime-acp';
import type {
  KanbanBoardListPayload,
  KanbanBoardPayload,
  KanbanCardSummaryPayload,
  KanbanColumnAutomationPayload,
  KanbanColumnPayload,
} from '../schemas/kanban';
import { getProjectById } from './project-service';
import {
  defaultTaskWorkflowColumns,
  resolveTaskWorkflowColumnStage,
} from './task-workflow-service';

const boardIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  10,
);
const defaultBoardName = 'Workflow Board';

interface BoardRow {
  created_at: string;
  id: string;
  name: string;
  project_id: string;
  updated_at: string;
}

interface ColumnRow {
  automation_json: string | null;
  board_id: string;
  id: string;
  name: string;
  position: number;
}

interface BoardTaskRow {
  assigned_role: string | null;
  assigned_specialist_name: string | null;
  board_id: string | null;
  column_id: string | null;
  execution_session_id: string | null;
  id: string;
  kind: 'plan' | 'implement' | 'review' | 'verify' | null;
  last_sync_error: string | null;
  position: number | null;
  priority: string | null;
  result_session_id: string | null;
  status: string;
  title: string;
  trigger_session_id: string | null;
  updated_at: string;
  verification_verdict: string | null;
}

function createBoardId() {
  return `brd_${boardIdGenerator()}`;
}

function createDefaultColumnRows(boardId: string, now: string) {
  return defaultTaskWorkflowColumns.map((column, position) => ({
    automationJson: createDefaultColumnAutomation(column.id),
    boardId,
    createdAt: now,
    id: `${boardId}_${column.id}`,
    name: column.name,
    position,
    updatedAt: now,
  }));
}

function createDefaultColumnAutomation(
  columnId: string,
): string | null {
  let automation: KanbanColumnAutomationPayload | null = null;

  if (columnId === 'dev') {
    automation = {
      autoAdvanceOnSuccess: false,
      enabled: true,
      provider: null,
      requiredArtifacts: [],
      specialistId: null,
      transitionType: 'entry',
    };
  }

  if (columnId === 'review') {
    automation = {
      autoAdvanceOnSuccess: true,
      enabled: true,
      provider: null,
      requiredArtifacts: [],
      specialistId: null,
      transitionType: 'entry',
    };
  }

  return automation ? JSON.stringify(automation) : null;
}

function mapColumnRow(row: ColumnRow): KanbanColumnPayload {
  return {
    automation: row.automation_json
      ? (JSON.parse(row.automation_json) as KanbanColumnAutomationPayload)
      : null,
    boardId: row.board_id,
    id: row.id,
    name: row.name,
    position: row.position,
    stage: resolveTaskWorkflowColumnStage(row.id, row.name),
  };
}

function mapBoardRow(
  row: BoardRow,
  columns: KanbanColumnPayload[],
): KanbanBoardPayload {
  return {
    columns,
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    updatedAt: row.updated_at,
  };
}

function throwBoardNotFound(projectId: string, boardId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/kanban-board-not-found',
    title: 'Kanban Board Not Found',
    status: 404,
    detail: `Board ${boardId} was not found in project ${projectId}`,
  });
}

function listBoardRows(sqlite: Database, projectId: string) {
  return sqlite
    .prepare(
      `
        SELECT id, project_id, name, created_at, updated_at
        FROM project_kanban_boards
        WHERE project_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC, created_at DESC
      `,
    )
    .all(projectId) as BoardRow[];
}

function listColumnRows(sqlite: Database, boardId: string) {
  return sqlite
    .prepare(
      `
        SELECT id, board_id, name, position, automation_json
        FROM project_kanban_columns
        WHERE board_id = ? AND deleted_at IS NULL
        ORDER BY position ASC, created_at ASC
      `,
    )
    .all(boardId) as ColumnRow[];
}

function listBoardTaskRows(
  sqlite: Database,
  projectId: string,
  boardId: string,
) {
  return sqlite
    .prepare(
      `
        SELECT
          id,
          board_id,
          column_id,
          title,
          status,
          kind,
          priority,
          position,
          assigned_role,
          assigned_specialist_name,
          trigger_session_id,
          execution_session_id,
          result_session_id,
          last_sync_error,
          verification_verdict,
          updated_at
        FROM project_tasks
        WHERE project_id = ? AND board_id = ? AND deleted_at IS NULL
      `,
    )
    .all(projectId, boardId) as BoardTaskRow[];
}

function mapBoardTaskRow(row: BoardTaskRow): KanbanCardSummaryPayload {
  return {
    assignedRole: row.assigned_role,
    assignedSpecialistName: row.assigned_specialist_name,
    boardId: row.board_id,
    columnId: row.column_id,
    executionSessionId: row.execution_session_id,
    id: row.id,
    kind: row.kind,
    lastSyncError: row.last_sync_error,
    position: row.position,
    priority: row.priority,
    resultSessionId: row.result_session_id,
    status: row.status,
    title: row.title,
    triggerSessionId: row.trigger_session_id,
    updatedAt: row.updated_at,
    verificationVerdict: row.verification_verdict,
  };
}

function compareKanbanCards(
  left: KanbanCardSummaryPayload,
  right: KanbanCardSummaryPayload,
) {
  const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
  const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;

  if (leftPosition !== rightPosition) {
    return leftPosition - rightPosition;
  }

  return right.updatedAt.localeCompare(left.updatedAt);
}

function attachCardsToColumns(
  columns: KanbanColumnPayload[],
  cards: KanbanCardSummaryPayload[],
) {
  const cardsByColumnId = new Map<string, KanbanCardSummaryPayload[]>();

  for (const card of cards) {
    if (!card.columnId) {
      continue;
    }

    const existing = cardsByColumnId.get(card.columnId) ?? [];
    existing.push(card);
    cardsByColumnId.set(card.columnId, existing);
  }

  return columns.map((column) => ({
    ...column,
    cards: (cardsByColumnId.get(column.id) ?? []).sort(compareKanbanCards),
  }));
}

function reconcileDefaultBoardColumns(
  sqlite: Database,
  board: BoardRow,
): KanbanColumnPayload[] {
  const existingColumns = listColumnRows(sqlite, board.id);
  const stageRows = new Map(
    existingColumns.map((row) => [
      resolveTaskWorkflowColumnStage(row.id, row.name),
      row,
    ]),
  );
  const now = new Date().toISOString();
  const insertColumn = sqlite.prepare(
    `
      INSERT INTO project_kanban_columns (
        id, board_id, name, position, automation_json, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @boardId, @name, @position, @automationJson, @createdAt, @updatedAt, NULL
      )
    `,
  );
  const updateColumn = sqlite.prepare(
    `
      UPDATE project_kanban_columns
      SET name = @name, position = @position, updated_at = @updatedAt
      WHERE id = @id
    `,
  );

  const syncColumns = sqlite.transaction(() => {
    for (const [position, definition] of defaultTaskWorkflowColumns.entries()) {
      const row = stageRows.get(definition.stage);
      if (!row) {
        insertColumn.run({
          automationJson: createDefaultColumnAutomation(definition.id),
          boardId: board.id,
          createdAt: now,
          id: `${board.id}_${definition.id}`,
          name: definition.name,
          position,
          updatedAt: now,
        });
        continue;
      }

      if (
        row.name !== definition.name ||
        row.position !== position
      ) {
        updateColumn.run({
          id: row.id,
          name: definition.name,
          position,
          updatedAt: now,
        });
      }
    }
  });

  syncColumns();

  return listColumnRows(sqlite, board.id).map(mapColumnRow);
}

export async function ensureDefaultKanbanBoard(
  sqlite: Database,
  projectId: string,
): Promise<KanbanBoardPayload> {
  await getProjectById(sqlite, projectId);

  const existingRows = listBoardRows(sqlite, projectId);
  if (existingRows.length > 0) {
    const existing = existingRows[0];
    return mapBoardRow(existing, reconcileDefaultBoardColumns(sqlite, existing));
  }

  const now = new Date().toISOString();
  const boardId = createBoardId();
  const columns = createDefaultColumnRows(boardId, now);

  const createBoard = sqlite.transaction(() => {
    sqlite
      .prepare(
        `
          INSERT INTO project_kanban_boards (
            id, project_id, name, created_at, updated_at, deleted_at
          ) VALUES (
            @id, @projectId, @name, @createdAt, @updatedAt, NULL
          )
        `,
      )
      .run({
        createdAt: now,
        id: boardId,
        name: defaultBoardName,
        projectId,
        updatedAt: now,
      });

    const insertColumn = sqlite.prepare(
      `
        INSERT INTO project_kanban_columns (
          id, board_id, name, position, automation_json, created_at, updated_at, deleted_at
        ) VALUES (
          @id, @boardId, @name, @position, @automationJson, @createdAt, @updatedAt, NULL
        )
      `,
    );

    for (const column of columns) {
      insertColumn.run(column);
    }
  });

  createBoard();

  return {
    columns: columns.map((column) =>
      mapColumnRow({
        automation_json: column.automationJson,
        board_id: column.boardId,
        id: column.id,
        name: column.name,
        position: column.position,
      }),
    ),
    createdAt: now,
    id: boardId,
    name: defaultBoardName,
    projectId,
    updatedAt: now,
  };
}

export async function listProjectKanbanBoards(
  sqlite: Database,
  projectId: string,
): Promise<KanbanBoardListPayload> {
  await ensureDefaultKanbanBoard(sqlite, projectId);

  const items = listBoardRows(sqlite, projectId).map((row) =>
    mapBoardRow(row, reconcileDefaultBoardColumns(sqlite, row)),
  );

  return {
    items,
    projectId,
  };
}

export async function getProjectKanbanBoardById(
  sqlite: Database,
  projectId: string,
  boardId: string,
): Promise<KanbanBoardPayload> {
  await ensureDefaultKanbanBoard(sqlite, projectId);

  const row = sqlite
    .prepare(
      `
        SELECT id, project_id, name, created_at, updated_at
        FROM project_kanban_boards
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `,
    )
    .get(boardId, projectId) as BoardRow | undefined;

  if (!row) {
    throwBoardNotFound(projectId, boardId);
  }

  const columns = reconcileDefaultBoardColumns(sqlite, row);
  const cards = listBoardTaskRows(sqlite, projectId, row.id).map(mapBoardTaskRow);

  return mapBoardRow(row, attachCardsToColumns(columns, cards));
}
