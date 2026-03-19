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
  getTaskWorkflowColumnDefinition,
  resolveTaskWorkflowColumnStage,
} from './task-workflow-service';
import { evaluateTaskArtifactGate } from './task-artifact-gate-service';

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
  completion_summary: string | null;
  execution_session_id: string | null;
  id: string;
  kind: 'plan' | 'implement' | 'review' | 'verify' | null;
  lane_handoffs_json: string;
  lane_sessions_json: string;
  last_sync_error: string | null;
  position: number | null;
  priority: string | null;
  result_session_id: string | null;
  status: string;
  title: string;
  trigger_session_id: string | null;
  updated_at: string;
  verification_report: string | null;
  verification_verdict: string | null;
}

function parseAutomationJson(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Partial<KanbanColumnAutomationPayload>)
      : null;
  } catch {
    return null;
  }
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
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

function resolveColumnAutomation(
  columnId: string,
  automationJson: string | null,
): KanbanColumnAutomationPayload | null {
  const definition = getTaskWorkflowColumnDefinition(columnId);
  const existing = parseAutomationJson(automationJson);

  const defaultsByColumnId: Partial<Record<string, KanbanColumnAutomationPayload>> = {
    blocked: {
      autoAdvanceOnSuccess: true,
      enabled: true,
      provider: null,
      requiredArtifacts: [],
      role: definition?.recommendedRole ?? null,
      specialistId: definition?.recommendedSpecialistId ?? null,
      specialistName: definition?.recommendedSpecialistName ?? null,
      transitionType: 'entry',
    },
    dev: {
      autoAdvanceOnSuccess: true,
      enabled: true,
      provider: null,
      requiredArtifacts: [],
      role: definition?.recommendedRole ?? null,
      specialistId: definition?.recommendedSpecialistId ?? null,
      specialistName: definition?.recommendedSpecialistName ?? null,
      transitionType: 'entry',
    },
    done: {
      autoAdvanceOnSuccess: false,
      enabled: true,
      provider: null,
      requiredArtifacts: [],
      role: definition?.recommendedRole ?? null,
      specialistId: definition?.recommendedSpecialistId ?? null,
      specialistName: definition?.recommendedSpecialistName ?? null,
      transitionType: 'entry',
    },
    review: {
      autoAdvanceOnSuccess: true,
      enabled: true,
      provider: null,
      requiredArtifacts: [],
      role: definition?.recommendedRole ?? null,
      specialistId: definition?.recommendedSpecialistId ?? null,
      specialistName: definition?.recommendedSpecialistName ?? null,
      transitionType: 'entry',
    },
    todo: {
      autoAdvanceOnSuccess: true,
      enabled: true,
      provider: null,
      requiredArtifacts: [],
      role: definition?.recommendedRole ?? null,
      specialistId: definition?.recommendedSpecialistId ?? null,
      specialistName: definition?.recommendedSpecialistName ?? null,
      transitionType: 'entry',
    },
  };
  const defaults = defaultsByColumnId[columnId];

  if (!existing && !defaults) {
    return null;
  }

  return {
    autoAdvanceOnSuccess:
      existing?.autoAdvanceOnSuccess ?? defaults?.autoAdvanceOnSuccess ?? false,
    enabled: existing?.enabled ?? defaults?.enabled ?? false,
    provider: existing?.provider ?? defaults?.provider ?? null,
    requiredArtifacts: Array.isArray(existing?.requiredArtifacts)
      ? existing.requiredArtifacts
      : defaults?.requiredArtifacts ?? [],
    role: existing?.role ?? defaults?.role ?? null,
    specialistId: existing?.specialistId ?? defaults?.specialistId ?? null,
    specialistName:
      existing?.specialistName ?? defaults?.specialistName ?? null,
    transitionType: existing?.transitionType ?? defaults?.transitionType ?? 'entry',
  };
}

function createDefaultColumnAutomation(
  columnId: string,
): string | null {
  const automation = resolveColumnAutomation(columnId, null);
  return automation ? JSON.stringify(automation) : null;
}

function normalizeColumnAutomationJson(
  columnId: string,
  automationJson: string | null,
) {
  const automation = resolveColumnAutomation(columnId, automationJson);
  return automation ? JSON.stringify(automation) : null;
}

function mapColumnRow(row: ColumnRow): KanbanColumnPayload {
  const stage = resolveTaskWorkflowColumnStage(row.id, row.name);
  const definition = stage ? getTaskWorkflowColumnDefinition(stage) : null;

  return {
    automation: resolveColumnAutomation(stage ?? row.id, row.automation_json),
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
          completion_summary,
          last_sync_error,
          verification_report,
          verification_verdict,
          lane_sessions_json,
          lane_handoffs_json,
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
    explain: null,
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

function buildExplainPayload(
  row: BoardTaskRow,
  column: KanbanColumnPayload | undefined,
) {
  if (!column) {
    return null;
  }

  const artifactGate = evaluateTaskArtifactGate(
    {
      completionSummary: row.completion_summary,
      laneHandoffs: parseJsonArray(row.lane_handoffs_json),
      laneSessions: parseJsonArray(row.lane_sessions_json),
      lastSyncError: row.last_sync_error,
      resultSessionId: row.result_session_id,
      status: row.status,
      title: row.title,
      triggerSessionId: row.trigger_session_id,
      verificationReport: row.verification_report,
      verificationVerdict: row.verification_verdict,
    } as Parameters<typeof evaluateTaskArtifactGate>[0],
    column,
    row.trigger_session_id ?? row.result_session_id,
  );
  const handoffs = parseJsonArray<{
    responseSummary?: string;
    status: string;
  }>(row.lane_handoffs_json);
  const latestHandoff = [...handoffs]
    .reverse()
    .find((handoff) => Boolean(handoff.responseSummary));
  const currentColumnReason = row.last_sync_error
    ? row.last_sync_error
    : row.trigger_session_id
      ? `Automation is currently running in ${column.name}.`
      : row.verification_verdict === 'fail'
        ? 'The latest review reported changes required before this card can move forward.'
        : row.status === 'WAITING_RETRY'
          ? 'This card is blocked and waiting for retry or intervention.'
          : column.stage === 'done'
            ? 'The card completed its workflow and is waiting for final summary output.'
            : `This card is currently staged in ${column.name}.`;
  const latestAutomationResult = row.trigger_session_id
    ? 'Automation session in progress'
    : row.verification_verdict === 'fail'
      ? 'Review failed'
      : row.verification_verdict === 'pass'
        ? 'Review passed'
        : row.result_session_id
          ? 'Automation session completed'
          : null;

  return {
    currentColumnReason,
    latestAutomationResult,
    missingArtifacts: artifactGate.missingArtifacts,
    recentTransitionReason:
      latestHandoff?.responseSummary ??
      row.verification_report ??
      row.completion_summary ??
      null,
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
  rows: BoardTaskRow[],
) {
  const cardsByColumnId = new Map<string, KanbanCardSummaryPayload[]>();
  const columnById = new Map(columns.map((column) => [column.id, column]));
  const rowByTaskId = new Map(rows.map((row) => [row.id, row]));

  for (const card of cards) {
    if (!card.columnId) {
      continue;
    }

    const existing = cardsByColumnId.get(card.columnId) ?? [];
    existing.push({
      ...card,
      explain:
        (rowByTaskId.get(card.id) &&
          buildExplainPayload(
            rowByTaskId.get(card.id)!,
            columnById.get(card.columnId),
          )) ??
        null,
    });
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
      SET
        name = @name,
        position = @position,
        automation_json = @automationJson,
        updated_at = @updatedAt
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
        row.position !== position ||
        row.automation_json !==
          normalizeColumnAutomationJson(definition.id, row.automation_json)
      ) {
        updateColumn.run({
          automationJson: normalizeColumnAutomationJson(
            definition.id,
            row.automation_json,
          ),
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
  const cardRows = listBoardTaskRows(sqlite, projectId, row.id);
  const cards = cardRows.map(mapBoardTaskRow);

  return mapBoardRow(row, attachCardsToColumns(columns, cards, cardRows));
}
