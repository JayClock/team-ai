import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
import type {
  KanbanBoardListPayload,
  KanbanBoardPayload,
  KanbanColumnAutomationPayload,
  KanbanColumnPayload,
} from '../schemas/kanban';
import { getProjectById } from './project-service';

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

function createBoardId() {
  return `brd_${boardIdGenerator()}`;
}

function createDefaultColumnRows(boardId: string, now: string) {
  const columns: Array<{
    automation: KanbanColumnAutomationPayload | null;
    id: string;
    name: string;
    position: number;
  }> = [
    { automation: null, id: `${boardId}_backlog`, name: 'Backlog', position: 0 },
    { automation: null, id: `${boardId}_todo`, name: 'Todo', position: 1 },
    {
      automation: {
        autoAdvanceOnSuccess: false,
        enabled: true,
        provider: null,
        requiredArtifacts: [],
        specialistId: null,
        transitionType: 'entry',
      },
      id: `${boardId}_dev`,
      name: 'Dev',
      position: 2,
    },
    {
      automation: {
        autoAdvanceOnSuccess: true,
        enabled: true,
        provider: null,
        requiredArtifacts: [],
        specialistId: null,
        transitionType: 'entry',
      },
      id: `${boardId}_review`,
      name: 'Review',
      position: 3,
    },
    { automation: null, id: `${boardId}_done`, name: 'Done', position: 4 },
  ];

  return columns.map((column) => ({
    automationJson: column.automation ? JSON.stringify(column.automation) : null,
    boardId,
    createdAt: now,
    id: column.id,
    name: column.name,
    position: column.position,
    updatedAt: now,
  }));
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

export async function ensureDefaultKanbanBoard(
  sqlite: Database,
  projectId: string,
): Promise<KanbanBoardPayload> {
  await getProjectById(sqlite, projectId);

  const existingRows = listBoardRows(sqlite, projectId);
  if (existingRows.length > 0) {
    const existing = existingRows[0];
    return mapBoardRow(
      existing,
      listColumnRows(sqlite, existing.id).map(mapColumnRow),
    );
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
    mapBoardRow(row, listColumnRows(sqlite, row.id).map(mapColumnRow)),
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

  return mapBoardRow(row, listColumnRows(sqlite, row.id).map(mapColumnRow));
}
