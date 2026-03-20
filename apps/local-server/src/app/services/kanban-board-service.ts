import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { ProblemError } from '@orchestration/runtime-acp';
import { getDrizzleDb } from '../db/drizzle';
import {
  projectKanbanBoardsTable,
  projectKanbanColumnsTable,
  projectTasksTable,
} from '../db/schema';
import type {
  KanbanBoardListPayload,
  KanbanBoardPayload,
  KanbanBoardSettingsPayload,
  KanbanCardSummaryPayload,
  KanbanColumnAutomationPayload,
  KanbanColumnPayload,
} from '../schemas/kanban';
import type {
  TaskLaneHandoffPayload,
  TaskLaneSessionPayload,
} from '../schemas/task';
import { getProjectById } from './project-service';
import {
  defaultTaskWorkflowColumns,
  getTaskWorkflowColumnDefinition,
  resolveTaskWorkflowColumnStage,
} from './task-workflow-service';
import { evaluateTaskArtifactGate } from './task-artifact-gate-service';
import {
  deriveKanbanCardMemory,
  listTraceLinksForTask,
} from './kanban-card-memory-service';

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
  is_default: boolean;
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

const boardRowSelection = {
  created_at: projectKanbanBoardsTable.createdAt,
  id: projectKanbanBoardsTable.id,
  is_default: projectKanbanBoardsTable.isDefault,
  name: projectKanbanBoardsTable.name,
  project_id: projectKanbanBoardsTable.projectId,
  settings_json: projectKanbanBoardsTable.settingsJson,
  updated_at: projectKanbanBoardsTable.updatedAt,
} as const;

const columnRowSelection = {
  automation_json: projectKanbanColumnsTable.automationJson,
  board_id: projectKanbanColumnsTable.boardId,
  id: projectKanbanColumnsTable.id,
  name: projectKanbanColumnsTable.name,
  position: projectKanbanColumnsTable.position,
  stage: projectKanbanColumnsTable.stage,
} as const;

const boardTaskRowSelection = {
  assigned_role: projectTasksTable.assignedRole,
  assigned_specialist_name: projectTasksTable.assignedSpecialistName,
  board_id: projectTasksTable.boardId,
  column_id: projectTasksTable.columnId,
  completion_summary: projectTasksTable.completionSummary,
  execution_session_id: projectTasksTable.executionSessionId,
  github_number: projectTasksTable.githubNumber,
  github_repo: projectTasksTable.githubRepo,
  github_state: projectTasksTable.githubState,
  github_url: projectTasksTable.githubUrl,
  id: projectTasksTable.id,
  kind: projectTasksTable.kind,
  lane_handoffs_json: projectTasksTable.laneHandoffsJson,
  lane_sessions_json: projectTasksTable.laneSessionsJson,
  last_sync_error: projectTasksTable.lastSyncError,
  position: projectTasksTable.position,
  priority: projectTasksTable.priority,
  result_session_id: projectTasksTable.resultSessionId,
  source_event_id: projectTasksTable.sourceEventId,
  source_type: projectTasksTable.sourceType,
  status: projectTasksTable.status,
  title: projectTasksTable.title,
  trigger_session_id: projectTasksTable.triggerSessionId,
  updated_at: projectTasksTable.updatedAt,
  verification_report: projectTasksTable.verificationReport,
  verification_verdict: projectTasksTable.verificationVerdict,
} as const;

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
      isDefault: row.is_default,
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
  return getDrizzleDb(sqlite)
    .select(boardRowSelection)
    .from(projectKanbanBoardsTable)
    .where(
      and(
        eq(projectKanbanBoardsTable.projectId, projectId),
        isNull(projectKanbanBoardsTable.deletedAt),
      ),
    )
    .orderBy(
      desc(projectKanbanBoardsTable.isDefault),
      desc(projectKanbanBoardsTable.updatedAt),
      desc(projectKanbanBoardsTable.createdAt),
    )
    .all() as BoardRow[];
}

function listColumnRows(sqlite: Database, boardId: string) {
  return getDrizzleDb(sqlite)
    .select(columnRowSelection)
    .from(projectKanbanColumnsTable)
    .where(
      and(
        eq(projectKanbanColumnsTable.boardId, boardId),
        isNull(projectKanbanColumnsTable.deletedAt),
      ),
    )
    .orderBy(
      asc(projectKanbanColumnsTable.position),
      asc(projectKanbanColumnsTable.createdAt),
    )
    .all() as ColumnRow[];
}

function listBoardTaskRows(
  sqlite: Database,
  projectId: string,
  boardId: string,
) {
  return getDrizzleDb(sqlite)
    .select(boardTaskRowSelection)
    .from(projectTasksTable)
    .where(
      and(
        eq(projectTasksTable.projectId, projectId),
        eq(projectTasksTable.boardId, boardId),
        isNull(projectTasksTable.deletedAt),
      ),
    )
    .all() as BoardTaskRow[];
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

function mapBoardTaskRow(
  sqlite: Database,
  row: BoardTaskRow,
): KanbanCardSummaryPayload {
  const laneSessions = parseJsonArray<TaskLaneSessionPayload>(
    row.lane_sessions_json,
  );
  const laneHandoffs = parseJsonArray<TaskLaneHandoffPayload>(
    row.lane_handoffs_json,
  );

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
    laneHandoffs,
    laneSessions,
    lastSyncError: row.last_sync_error,
    memory: deriveKanbanCardMemory({
      completionSummary: row.completion_summary,
      laneHandoffs,
      lastSyncError: row.last_sync_error,
      status: row.status,
      verificationReport: row.verification_report,
      verificationVerdict: row.verification_verdict,
    }),
    position: row.position,
    priority: row.priority,
    recentOutputSummary:
      row.verification_report ?? row.completion_summary ?? null,
    resultSessionId: row.result_session_id,
    sourceEventId: row.source_event_id,
    sourceType: row.source_type,
    status: row.status,
    title: row.title,
    traceLinks: listTraceLinksForTask(sqlite, {
      executionSessionId: row.execution_session_id,
      laneSessions,
      resultSessionId: row.result_session_id,
      triggerSessionId: row.trigger_session_id,
    }),
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

  const syncColumns = sqlite.transaction(() => {
    const db = getDrizzleDb(sqlite);
    for (const [position, definition] of defaultTaskWorkflowColumns.entries()) {
      const row = stageRows.get(definition.stage);
      if (!row) {
        db.insert(projectKanbanColumnsTable)
          .values({
            automationJson: createDefaultColumnAutomation(definition.id),
            boardId: board.id,
            createdAt: now,
            deletedAt: null,
            id: `${board.id}_${definition.id}`,
            name: definition.name,
            position,
            stage: definition.stage,
            updatedAt: now,
          })
          .run();
        continue;
      }

      if (
        row.name !== definition.name ||
        row.position !== position ||
        row.stage !== definition.stage ||
        row.automation_json !==
          normalizeColumnAutomationJson(definition.id, row.automation_json)
      ) {
        db.update(projectKanbanColumnsTable)
          .set({
            automationJson: normalizeColumnAutomationJson(
              definition.id,
              row.automation_json,
            ),
            name: definition.name,
            position,
            stage: definition.stage,
            updatedAt: now,
          })
          .where(eq(projectKanbanColumnsTable.id, row.id))
          .run();
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
    const existing = existingRows.find((row) => row.is_default) ?? existingRows[0];
    const columns = boardUsesWorkflowTemplate(existing)
      ? reconcileDefaultBoardColumns(sqlite, existing)
      : listColumnRows(sqlite, existing.id).map(mapColumnRow);
    return mapBoardRow(existing, columns);
  }

  const now = new Date().toISOString();
  const boardId = createBoardId();
  const columns = createDefaultColumnRows(boardId, now);

  const createBoard = sqlite.transaction(() => {
    const db = getDrizzleDb(sqlite);
    db.insert(projectKanbanBoardsTable)
      .values({
        createdAt: now,
        deletedAt: null,
        id: boardId,
        isDefault: true,
        name: defaultBoardName,
        projectId,
        settingsJson: stringifyBoardSettings(undefined, 'workflow'),
        updatedAt: now,
      })
      .run();

    for (const column of columns) {
      db.insert(projectKanbanColumnsTable)
        .values({
          ...column,
          deletedAt: null,
        })
        .run();
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

  const row = getDrizzleDb(sqlite)
    .select(boardRowSelection)
    .from(projectKanbanBoardsTable)
    .where(
      and(
        eq(projectKanbanBoardsTable.id, boardId),
        eq(projectKanbanBoardsTable.projectId, projectId),
        isNull(projectKanbanBoardsTable.deletedAt),
      ),
    )
    .get() as BoardRow | undefined;

  if (!row) {
    throwBoardNotFound(projectId, boardId);
  }

  const columns = boardUsesWorkflowTemplate(row)
    ? reconcileDefaultBoardColumns(sqlite, row)
    : listColumnRows(sqlite, row.id).map(mapColumnRow);
  const cardRows = listBoardTaskRows(sqlite, projectId, row.id);
  const cards = cardRows.map((row) => mapBoardTaskRow(sqlite, row));

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
  const row = getDrizzleDb(sqlite)
    .select(boardRowSelection)
    .from(projectKanbanBoardsTable)
    .where(
      and(
        eq(projectKanbanBoardsTable.id, boardId),
        eq(projectKanbanBoardsTable.projectId, projectId),
        isNull(projectKanbanBoardsTable.deletedAt),
      ),
    )
    .get() as BoardRow | undefined;

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
  const row = getDrizzleDb(sqlite)
    .select(columnRowSelection)
    .from(projectKanbanColumnsTable)
    .where(
      and(
        eq(projectKanbanColumnsTable.id, columnId),
        eq(projectKanbanColumnsTable.boardId, boardId),
        isNull(projectKanbanColumnsTable.deletedAt),
      ),
    )
    .get() as ColumnRow | undefined;

  if (!row) {
    throwColumnNotFound(boardId, columnId);
  }

  return row;
}

function setDefaultBoard(sqlite: Database, projectId: string, boardId: string) {
  getDrizzleDb(sqlite)
    .update(projectKanbanBoardsTable)
    .set({
      isDefault: sql`${projectKanbanBoardsTable.id} = ${boardId}`,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(projectKanbanBoardsTable.projectId, projectId),
        isNull(projectKanbanBoardsTable.deletedAt),
      ),
    )
    .run();
}

function reorderColumns(
  sqlite: Database,
  boardId: string,
  orderedColumnIds: string[],
) {
  const now = new Date().toISOString();

  const transaction = sqlite.transaction(() => {
    const db = getDrizzleDb(sqlite);
    orderedColumnIds.forEach((columnId, index) => {
      db.update(projectKanbanColumnsTable)
        .set({
          position: index,
          updatedAt: now,
        })
        .where(
          and(
            eq(projectKanbanColumnsTable.id, columnId),
            eq(projectKanbanColumnsTable.boardId, boardId),
            isNull(projectKanbanColumnsTable.deletedAt),
          ),
        )
        .run();
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
    const db = getDrizzleDb(sqlite);
    if (isDefault) {
      setDefaultBoard(sqlite, input.projectId, boardId);
    }

    db.insert(projectKanbanBoardsTable)
      .values({
        createdAt: now,
        deletedAt: null,
        id: boardId,
        isDefault,
        name: input.name,
        projectId: input.projectId,
        settingsJson: stringifyBoardSettings(input.settings, 'custom'),
        updatedAt: now,
      })
      .run();

    for (const column of columns) {
      db.insert(projectKanbanColumnsTable)
        .values({
          ...column,
          deletedAt: null,
        })
        .run();
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
    const db = getDrizzleDb(sqlite);
    if (input.isDefault) {
      setDefaultBoard(sqlite, input.projectId, input.boardId);
    }

    db.update(projectKanbanBoardsTable)
      .set({
        isDefault:
          input.isDefault === undefined ? current.is_default : input.isDefault,
        name: input.name ?? current.name,
        settingsJson: stringifyBoardSettings(
          mergedSettings,
          boardUsesWorkflowTemplate(current) ? 'workflow' : 'custom',
        ),
        updatedAt: now,
      })
      .where(
        and(
          eq(projectKanbanBoardsTable.id, input.boardId),
          eq(projectKanbanBoardsTable.projectId, input.projectId),
          isNull(projectKanbanBoardsTable.deletedAt),
        ),
      )
      .run();
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

  getDrizzleDb(sqlite)
    .insert(projectKanbanColumnsTable)
    .values({
      automationJson,
      boardId: input.boardId,
      createdAt: now,
      deletedAt: null,
      id: columnId,
      name: input.name,
      position: columns.length,
      stage,
      updatedAt: now,
    })
    .run();

  const orderedIds = listColumnRows(sqlite, input.boardId).map((column) => column.id);
  const currentIndex = orderedIds.indexOf(columnId);
  orderedIds.splice(currentIndex, 1);
  orderedIds.splice(targetPosition, 0, columnId);
  reorderColumns(sqlite, input.boardId, orderedIds);

  getDrizzleDb(sqlite)
    .update(projectKanbanBoardsTable)
    .set({
      updatedAt: now,
    })
    .where(eq(projectKanbanBoardsTable.id, board.id))
    .run();

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

  getDrizzleDb(sqlite)
    .update(projectKanbanColumnsTable)
    .set({
      automationJson: nextAutomationJson,
      name: input.name ?? column.name,
      stage: nextStage,
      updatedAt: now,
    })
    .where(
      and(
        eq(projectKanbanColumnsTable.id, input.columnId),
        eq(projectKanbanColumnsTable.boardId, input.boardId),
        isNull(projectKanbanColumnsTable.deletedAt),
      ),
    )
    .run();

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

  const activeTaskCount = getDrizzleDb(sqlite)
    .select({
      total: sql<number>`count(*)`,
    })
    .from(projectTasksTable)
    .where(
      and(
        eq(projectTasksTable.projectId, input.projectId),
        eq(projectTasksTable.boardId, input.boardId),
        eq(projectTasksTable.columnId, input.columnId),
        isNull(projectTasksTable.deletedAt),
      ),
    )
    .get() as { total: number };

  if (activeTaskCount.total > 0) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/kanban-column-not-empty',
      title: 'Kanban Column Not Empty',
      status: 409,
      detail: `Column ${input.columnId} still contains ${activeTaskCount.total} cards`,
    });
  }

  const now = new Date().toISOString();
  getDrizzleDb(sqlite)
    .update(projectKanbanColumnsTable)
    .set({
      deletedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(projectKanbanColumnsTable.id, input.columnId),
        eq(projectKanbanColumnsTable.boardId, input.boardId),
        isNull(projectKanbanColumnsTable.deletedAt),
      ),
    )
    .run();

  reorderColumns(
    sqlite,
    input.boardId,
    listColumnRows(sqlite, input.boardId).map((column) => column.id),
  );

  return getProjectKanbanBoardById(sqlite, input.projectId, input.boardId);
}
