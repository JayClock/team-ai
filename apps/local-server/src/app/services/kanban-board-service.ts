import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '@orchestration/runtime-acp';
import type {
  KanbanBoardListPayload,
  KanbanBoardPayload,
  KanbanBoardSettingsPayload,
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
const columnIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  8,
);
const defaultBoardName = 'Workflow Board';
const defaultBoardSettings: Omit<KanbanBoardSettingsPayload, 'isDefault'> = {
  boardConcurrency: null,
  wipLimit: null,
};
type ManagedBoardTemplate = 'custom' | 'workflow';

interface ParsedBoardSettingsRecord {
  boardConcurrency: number | null;
  managedTemplate: ManagedBoardTemplate;
  wipLimit: number | null;
}

interface BoardRow {
  created_at: string;
  id: string;
  is_default: number;
  name: string;
  project_id: string;
  settings_json: string;
  updated_at: string;
}

interface ColumnRow {
  automation_json: string | null;
  board_id: string;
  id: string;
  name: string;
  position: number;
  stage: KanbanColumnPayload['stage'];
}

interface BoardTaskRow {
  assigned_role: string | null;
  assigned_specialist_name: string | null;
  board_id: string | null;
  column_id: string | null;
  completion_summary: string | null;
  execution_session_id: string | null;
  github_number: number | null;
  github_repo: string | null;
  github_state: string | null;
  github_url: string | null;
  id: string;
  kind: 'plan' | 'implement' | 'review' | 'verify' | null;
  lane_handoffs_json: string;
  lane_sessions_json: string;
  last_sync_error: string | null;
  position: number | null;
  priority: string | null;
  result_session_id: string | null;
  source_event_id: string | null;
  source_type: string;
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

function createColumnId(boardId: string) {
  return `${boardId}_col_${columnIdGenerator()}`;
}

function parseBoardSettingsRecord(value: string | null): ParsedBoardSettingsRecord {
  if (!value) {
    return {
      ...defaultBoardSettings,
      managedTemplate: 'workflow',
    };
  }

  try {
    const parsed = JSON.parse(value) as {
      boardConcurrency?: number | null;
      managedTemplate?: ManagedBoardTemplate;
      wipLimit?: number | null;
    };
    return {
      boardConcurrency:
        typeof parsed.boardConcurrency === 'number'
          ? parsed.boardConcurrency
          : defaultBoardSettings.boardConcurrency,
      managedTemplate:
        parsed.managedTemplate === 'custom' ? 'custom' : 'workflow',
      wipLimit:
        typeof parsed.wipLimit === 'number'
          ? parsed.wipLimit
          : defaultBoardSettings.wipLimit,
    };
  } catch {
    return {
      ...defaultBoardSettings,
      managedTemplate: 'workflow',
    };
  }
}

function stringifyBoardSettings(
  settings?: Partial<Omit<KanbanBoardSettingsPayload, 'isDefault'>>,
  managedTemplate: ManagedBoardTemplate = 'custom',
) {
  return JSON.stringify({
    boardConcurrency:
      settings?.boardConcurrency ?? defaultBoardSettings.boardConcurrency,
    managedTemplate,
    wipLimit: settings?.wipLimit ?? defaultBoardSettings.wipLimit,
  });
}

function createDefaultColumnRows(boardId: string, now: string) {
  return defaultTaskWorkflowColumns.map((column, position) => ({
    automationJson: createDefaultColumnAutomation(column.id),
    boardId,
    createdAt: now,
    id: `${boardId}_${column.id}`,
    name: column.name,
    position,
    stage: column.stage,
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
      allowedSourceColumnIds: [],
      autoAdvanceOnSuccess: true,
      enabled: true,
      manualApprovalRequired: false,
      provider: null,
      requiredArtifacts: [],
      role: definition?.recommendedRole ?? null,
      specialistId: definition?.recommendedSpecialistId ?? null,
      specialistName: definition?.recommendedSpecialistName ?? null,
      transitionType: 'entry',
    },
    dev: {
      allowedSourceColumnIds: [],
      autoAdvanceOnSuccess: true,
      enabled: true,
      manualApprovalRequired: false,
      provider: null,
      requiredArtifacts: [],
      role: definition?.recommendedRole ?? null,
      specialistId: definition?.recommendedSpecialistId ?? null,
      specialistName: definition?.recommendedSpecialistName ?? null,
      transitionType: 'entry',
    },
    done: {
      allowedSourceColumnIds: [],
      autoAdvanceOnSuccess: false,
      enabled: true,
      manualApprovalRequired: false,
      provider: null,
      requiredArtifacts: [],
      role: definition?.recommendedRole ?? null,
      specialistId: definition?.recommendedSpecialistId ?? null,
      specialistName: definition?.recommendedSpecialistName ?? null,
      transitionType: 'entry',
    },
    review: {
      allowedSourceColumnIds: [],
      autoAdvanceOnSuccess: true,
      enabled: true,
      manualApprovalRequired: false,
      provider: null,
      requiredArtifacts: [],
      role: definition?.recommendedRole ?? null,
      specialistId: definition?.recommendedSpecialistId ?? null,
      specialistName: definition?.recommendedSpecialistName ?? null,
      transitionType: 'entry',
    },
    todo: {
      allowedSourceColumnIds: [],
      autoAdvanceOnSuccess: true,
      enabled: true,
      manualApprovalRequired: false,
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
    allowedSourceColumnIds: Array.isArray(existing?.allowedSourceColumnIds)
      ? existing.allowedSourceColumnIds.filter((item): item is string => {
          return typeof item === 'string' && item.trim().length > 0;
        })
      : [],
    autoAdvanceOnSuccess:
      existing?.autoAdvanceOnSuccess ?? defaults?.autoAdvanceOnSuccess ?? false,
    enabled: existing?.enabled ?? defaults?.enabled ?? false,
    manualApprovalRequired: existing?.manualApprovalRequired ?? false,
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
  const stage = row.stage ?? resolveTaskWorkflowColumnStage(row.id, row.name);
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
  const settings = parseBoardSettingsRecord(row.settings_json);

  return {
    columns,
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    settings: {
      ...settings,
      isDefault: row.is_default === 1,
    },
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
          , is_default, settings_json
        FROM project_kanban_boards
        WHERE project_id = ? AND deleted_at IS NULL
        ORDER BY is_default DESC, updated_at DESC, created_at DESC
      `,
    )
    .all(projectId) as BoardRow[];
}

function listColumnRows(sqlite: Database, boardId: string) {
  return sqlite
    .prepare(
      `
        SELECT id, board_id, name, position, automation_json, stage
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
          github_number,
          github_repo,
          github_state,
          github_url,
          last_sync_error,
          source_event_id,
          source_type,
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

function flattenArtifactEvidence(row: BoardTaskRow) {
  const handoffs = parseJsonArray<{
    artifactEvidence?: string[];
  }>(row.lane_handoffs_json);
  const evidence = new Set<string>();

  for (const handoff of handoffs) {
    for (const artifact of handoff.artifactEvidence ?? []) {
      if (artifact.trim()) {
        evidence.add(artifact.trim());
      }
    }
  }

  return [...evidence];
}

function mapBoardTaskRow(row: BoardTaskRow): KanbanCardSummaryPayload {
  return {
    assignedRole: row.assigned_role,
    assignedSpecialistName: row.assigned_specialist_name,
    artifactEvidence: flattenArtifactEvidence(row),
    boardId: row.board_id,
    columnId: row.column_id,
    completionSummary: row.completion_summary,
    explain: null,
    executionSessionId: row.execution_session_id,
    githubNumber: row.github_number,
    githubRepo: row.github_repo,
    githubState: row.github_state,
    githubUrl: row.github_url,
    id: row.id,
    kind: row.kind,
    laneHandoffs: parseJsonArray(row.lane_handoffs_json),
    laneSessions: parseJsonArray(row.lane_sessions_json),
    lastSyncError: row.last_sync_error,
    position: row.position,
    priority: row.priority,
    recentOutputSummary:
      row.verification_report ?? row.completion_summary ?? null,
    resultSessionId: row.result_session_id,
    sourceEventId: row.source_event_id,
    sourceType: row.source_type,
    status: row.status,
    title: row.title,
    triggerSessionId: row.trigger_session_id,
    updatedAt: row.updated_at,
    verificationReport: row.verification_report,
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
  const decisionLog = [
    currentColumnReason,
    latestAutomationResult,
    artifactGate.message,
    latestHandoff?.responseSummary ?? null,
    row.verification_report,
    row.completion_summary,
  ].filter((entry): entry is string => Boolean(entry));

  return {
    currentColumnReason,
    decisionLog,
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

function boardUsesWorkflowTemplate(row: BoardRow) {
  return parseBoardSettingsRecord(row.settings_json).managedTemplate === 'workflow';
}

function reconcileDefaultBoardColumns(
  sqlite: Database,
  board: BoardRow,
): KanbanColumnPayload[] {
  const existingColumns = listColumnRows(sqlite, board.id);
  const stageRows = new Map(
    existingColumns.map((row) => [
      row.stage ?? resolveTaskWorkflowColumnStage(row.id, row.name),
      row,
    ]),
  );
  const now = new Date().toISOString();
  const insertColumn = sqlite.prepare(
    `
      INSERT INTO project_kanban_columns (
        id, board_id, name, position, stage, automation_json, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @boardId, @name, @position, @stage, @automationJson, @createdAt, @updatedAt, NULL
      )
    `,
  );
  const updateColumn = sqlite.prepare(
    `
      UPDATE project_kanban_columns
      SET
        name = @name,
        position = @position,
        stage = @stage,
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
          stage: definition.stage,
          updatedAt: now,
        });
        continue;
      }

      if (
        row.name !== definition.name ||
        row.position !== position ||
        row.stage !== definition.stage ||
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
          stage: definition.stage,
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
    const existing = existingRows.find((row) => row.is_default === 1) ?? existingRows[0];
    const columns = boardUsesWorkflowTemplate(existing)
      ? reconcileDefaultBoardColumns(sqlite, existing)
      : listColumnRows(sqlite, existing.id).map(mapColumnRow);
    return mapBoardRow(existing, columns);
  }

  const now = new Date().toISOString();
  const boardId = createBoardId();
  const columns = createDefaultColumnRows(boardId, now);

  const createBoard = sqlite.transaction(() => {
    sqlite
      .prepare(
        `
          INSERT INTO project_kanban_boards (
            id, project_id, name, is_default, settings_json, created_at, updated_at, deleted_at
          ) VALUES (
            @id, @projectId, @name, @isDefault, @settingsJson, @createdAt, @updatedAt, NULL
          )
        `,
      )
      .run({
        createdAt: now,
        id: boardId,
        isDefault: 1,
        name: defaultBoardName,
        projectId,
        settingsJson: stringifyBoardSettings(undefined, 'workflow'),
        updatedAt: now,
      });

    const insertColumn = sqlite.prepare(
      `
        INSERT INTO project_kanban_columns (
          id, board_id, name, position, stage, automation_json, created_at, updated_at, deleted_at
        ) VALUES (
          @id, @boardId, @name, @position, @stage, @automationJson, @createdAt, @updatedAt, NULL
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
        stage: column.stage,
      }),
    ),
    createdAt: now,
    id: boardId,
    name: defaultBoardName,
    projectId,
    settings: {
      ...defaultBoardSettings,
      isDefault: true,
    },
    updatedAt: now,
  };
}

export async function listProjectKanbanBoards(
  sqlite: Database,
  projectId: string,
): Promise<KanbanBoardListPayload> {
  await ensureDefaultKanbanBoard(sqlite, projectId);

  const items = listBoardRows(sqlite, projectId).map((row) =>
    mapBoardRow(
      row,
      boardUsesWorkflowTemplate(row)
        ? reconcileDefaultBoardColumns(sqlite, row)
        : listColumnRows(sqlite, row.id).map(mapColumnRow),
    ),
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
        SELECT id, project_id, name, is_default, settings_json, created_at, updated_at
        FROM project_kanban_boards
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `,
    )
    .get(boardId, projectId) as BoardRow | undefined;

  if (!row) {
    throwBoardNotFound(projectId, boardId);
  }

  const columns = boardUsesWorkflowTemplate(row)
    ? reconcileDefaultBoardColumns(sqlite, row)
    : listColumnRows(sqlite, row.id).map(mapColumnRow);
  const cardRows = listBoardTaskRows(sqlite, projectId, row.id);
  const cards = cardRows.map(mapBoardTaskRow);

  return mapBoardRow(row, attachCardsToColumns(columns, cards, cardRows));
}

function throwColumnNotFound(boardId: string, columnId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/kanban-column-not-found',
    title: 'Kanban Column Not Found',
    status: 404,
    detail: `Column ${columnId} was not found in board ${boardId}`,
  });
}

function getBoardRowById(
  sqlite: Database,
  projectId: string,
  boardId: string,
) {
  const row = sqlite
    .prepare(
      `
        SELECT id, project_id, name, is_default, settings_json, created_at, updated_at
        FROM project_kanban_boards
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `,
    )
    .get(boardId, projectId) as BoardRow | undefined;

  if (!row) {
    throwBoardNotFound(projectId, boardId);
  }

  return row;
}

function getColumnRowById(
  sqlite: Database,
  boardId: string,
  columnId: string,
) {
  const row = sqlite
    .prepare(
      `
        SELECT id, board_id, name, position, stage, automation_json
        FROM project_kanban_columns
        WHERE id = ? AND board_id = ? AND deleted_at IS NULL
      `,
    )
    .get(columnId, boardId) as ColumnRow | undefined;

  if (!row) {
    throwColumnNotFound(boardId, columnId);
  }

  return row;
}

function setDefaultBoard(sqlite: Database, projectId: string, boardId: string) {
  sqlite
    .prepare(
      `
        UPDATE project_kanban_boards
        SET is_default = CASE WHEN id = @boardId THEN 1 ELSE 0 END,
            updated_at = @updatedAt
        WHERE project_id = @projectId AND deleted_at IS NULL
      `,
    )
    .run({
      boardId,
      projectId,
      updatedAt: new Date().toISOString(),
    });
}

function reorderColumns(
  sqlite: Database,
  boardId: string,
  orderedColumnIds: string[],
) {
  const update = sqlite.prepare(
    `
      UPDATE project_kanban_columns
      SET position = @position,
          updated_at = @updatedAt
      WHERE id = @columnId AND board_id = @boardId AND deleted_at IS NULL
    `,
  );
  const now = new Date().toISOString();

  const transaction = sqlite.transaction(() => {
    orderedColumnIds.forEach((columnId, index) => {
      update.run({
        boardId,
        columnId,
        position: index,
        updatedAt: now,
      });
    });
  });

  transaction();
}

export async function createKanbanBoard(
  sqlite: Database,
  input: {
    isDefault?: boolean;
    name: string;
    projectId: string;
    settings?: Partial<Omit<KanbanBoardSettingsPayload, 'isDefault'>>;
  },
): Promise<KanbanBoardPayload> {
  await getProjectById(sqlite, input.projectId);

  const now = new Date().toISOString();
  const boardId = createBoardId();
  const existingBoards = listBoardRows(sqlite, input.projectId);
  const isDefault = input.isDefault ?? existingBoards.length === 0;
  const columns = createDefaultColumnRows(boardId, now);

  const transaction = sqlite.transaction(() => {
    if (isDefault) {
      setDefaultBoard(sqlite, input.projectId, boardId);
    }

    sqlite
      .prepare(
        `
          INSERT INTO project_kanban_boards (
            id, project_id, name, is_default, settings_json, created_at, updated_at, deleted_at
          ) VALUES (
            @id, @projectId, @name, @isDefault, @settingsJson, @createdAt, @updatedAt, NULL
          )
        `,
      )
      .run({
        createdAt: now,
        id: boardId,
        isDefault: isDefault ? 1 : 0,
        name: input.name,
        projectId: input.projectId,
        settingsJson: stringifyBoardSettings(input.settings, 'custom'),
        updatedAt: now,
      });

    const insertColumn = sqlite.prepare(
      `
        INSERT INTO project_kanban_columns (
          id, board_id, name, position, stage, automation_json, created_at, updated_at, deleted_at
        ) VALUES (
          @id, @boardId, @name, @position, @stage, @automationJson, @createdAt, @updatedAt, NULL
        )
      `,
    );

    for (const column of columns) {
      insertColumn.run(column);
    }
  });

  transaction();

  return getProjectKanbanBoardById(sqlite, input.projectId, boardId);
}

export async function updateKanbanBoard(
  sqlite: Database,
  input: {
    boardId: string;
    isDefault?: boolean;
    name?: string;
    projectId: string;
    settings?: Partial<Omit<KanbanBoardSettingsPayload, 'isDefault'>>;
  },
): Promise<KanbanBoardPayload> {
  const current = getBoardRowById(sqlite, input.projectId, input.boardId);
  const now = new Date().toISOString();
  const mergedSettings = {
    ...parseBoardSettingsRecord(current.settings_json),
    ...(input.settings ?? {}),
  };

  const transaction = sqlite.transaction(() => {
    if (input.isDefault) {
      setDefaultBoard(sqlite, input.projectId, input.boardId);
    }

    sqlite
      .prepare(
        `
          UPDATE project_kanban_boards
          SET name = @name,
              is_default = @isDefault,
              settings_json = @settingsJson,
              updated_at = @updatedAt
          WHERE id = @id AND project_id = @projectId AND deleted_at IS NULL
        `,
      )
      .run({
        id: input.boardId,
        isDefault:
          input.isDefault === undefined
            ? current.is_default
            : input.isDefault
              ? 1
              : 0,
        name: input.name ?? current.name,
        projectId: input.projectId,
        settingsJson: stringifyBoardSettings(mergedSettings, boardUsesWorkflowTemplate(current) ? 'workflow' : 'custom'),
        updatedAt: now,
      });
  });

  transaction();

  return getProjectKanbanBoardById(sqlite, input.projectId, input.boardId);
}

export async function createKanbanColumn(
  sqlite: Database,
  input: {
    automation?: Partial<KanbanColumnAutomationPayload> | null;
    boardId: string;
    name: string;
    position?: number | null;
    projectId: string;
    stage?: KanbanColumnPayload['stage'];
  },
): Promise<KanbanBoardPayload> {
  const board = getBoardRowById(sqlite, input.projectId, input.boardId);
  const columns = listColumnRows(sqlite, input.boardId);
  const targetPosition =
    input.position == null
      ? columns.length
      : Math.max(0, Math.min(input.position, columns.length));
  const now = new Date().toISOString();
  const columnId = createColumnId(input.boardId);
  const stage = input.stage ?? null;
  const automationJson =
    input.automation === null
      ? null
      : normalizeColumnAutomationJson(
          stage ?? columnId,
          input.automation ? JSON.stringify(input.automation) : null,
        );

  sqlite
    .prepare(
      `
        INSERT INTO project_kanban_columns (
          id, board_id, name, position, stage, automation_json, created_at, updated_at, deleted_at
        ) VALUES (
          @id, @boardId, @name, @position, @stage, @automationJson, @createdAt, @updatedAt, NULL
        )
      `,
    )
    .run({
      automationJson,
      boardId: input.boardId,
      createdAt: now,
      id: columnId,
      name: input.name,
      position: columns.length,
      stage,
      updatedAt: now,
    });

  const orderedIds = listColumnRows(sqlite, input.boardId).map((column) => column.id);
  const currentIndex = orderedIds.indexOf(columnId);
  orderedIds.splice(currentIndex, 1);
  orderedIds.splice(targetPosition, 0, columnId);
  reorderColumns(sqlite, input.boardId, orderedIds);

  sqlite
    .prepare(
      `
        UPDATE project_kanban_boards
        SET updated_at = @updatedAt
        WHERE id = @boardId
      `,
    )
    .run({
      boardId: board.id,
      updatedAt: now,
    });

  return getProjectKanbanBoardById(sqlite, input.projectId, input.boardId);
}

export async function updateKanbanColumn(
  sqlite: Database,
  input: {
    automation?: Partial<KanbanColumnAutomationPayload> | null;
    boardId: string;
    columnId: string;
    name?: string;
    position?: number | null;
    projectId: string;
    stage?: KanbanColumnPayload['stage'] | null;
  },
): Promise<KanbanBoardPayload> {
  getBoardRowById(sqlite, input.projectId, input.boardId);
  const column = getColumnRowById(sqlite, input.boardId, input.columnId);
  const now = new Date().toISOString();
  const nextStage =
    input.stage === undefined
      ? column.stage ?? resolveTaskWorkflowColumnStage(column.id, column.name)
      : input.stage;
  const nextAutomationJson =
    input.automation === undefined
      ? normalizeColumnAutomationJson(nextStage ?? column.id, column.automation_json)
      : input.automation === null
        ? null
        : normalizeColumnAutomationJson(
            nextStage ?? column.id,
            JSON.stringify({
              ...(parseAutomationJson(column.automation_json) ?? {}),
              ...input.automation,
            }),
          );

  sqlite
    .prepare(
      `
        UPDATE project_kanban_columns
        SET name = @name,
            stage = @stage,
            automation_json = @automationJson,
            updated_at = @updatedAt
        WHERE id = @columnId AND board_id = @boardId AND deleted_at IS NULL
      `,
    )
    .run({
      automationJson: nextAutomationJson,
      boardId: input.boardId,
      columnId: input.columnId,
      name: input.name ?? column.name,
      stage: nextStage,
      updatedAt: now,
    });

  if (input.position !== undefined) {
    const orderedIds = listColumnRows(sqlite, input.boardId).map((entry) => entry.id);
    const currentIndex = orderedIds.indexOf(input.columnId);
    const targetPosition = Math.max(0, Math.min(input.position ?? 0, orderedIds.length - 1));
    orderedIds.splice(currentIndex, 1);
    orderedIds.splice(targetPosition, 0, input.columnId);
    reorderColumns(sqlite, input.boardId, orderedIds);
  }

  return getProjectKanbanBoardById(sqlite, input.projectId, input.boardId);
}

export async function deleteKanbanColumn(
  sqlite: Database,
  input: {
    boardId: string;
    columnId: string;
    projectId: string;
  },
): Promise<KanbanBoardPayload> {
  getBoardRowById(sqlite, input.projectId, input.boardId);
  getColumnRowById(sqlite, input.boardId, input.columnId);

  const activeTaskCount = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM project_tasks
        WHERE project_id = ?
          AND board_id = ?
          AND column_id = ?
          AND deleted_at IS NULL
      `,
    )
    .get(input.projectId, input.boardId, input.columnId) as { total: number };

  if (activeTaskCount.total > 0) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/kanban-column-not-empty',
      title: 'Kanban Column Not Empty',
      status: 409,
      detail: `Column ${input.columnId} still contains ${activeTaskCount.total} cards`,
    });
  }

  const now = new Date().toISOString();
  sqlite
    .prepare(
      `
        UPDATE project_kanban_columns
        SET deleted_at = @deletedAt,
            updated_at = @updatedAt
        WHERE id = @columnId AND board_id = @boardId AND deleted_at IS NULL
      `,
    )
    .run({
      boardId: input.boardId,
      columnId: input.columnId,
      deletedAt: now,
      updatedAt: now,
    });

  reorderColumns(
    sqlite,
    input.boardId,
    listColumnRows(sqlite, input.boardId).map((column) => column.id),
  );

  return getProjectKanbanBoardById(sqlite, input.projectId, input.boardId);
}
