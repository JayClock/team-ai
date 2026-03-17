import type { Database } from 'better-sqlite3';
import { ProblemError } from '../errors/problem-error';
import type { NotePayload } from '../schemas/note';
import type { TaskKind, TaskPayload } from '../schemas/task';
import { createTask, deleteTask, getTaskById, updateTask } from './task-service';

const specTaskSourceType = 'spec_note';
const mutableSpecTaskStatuses = new Set([
  'PENDING',
  'READY',
  'WAITING_RETRY',
  'CANCELLED',
]);

type ParsedSpecTaskSectionMap = {
  body: string;
  definitionOfDone: string;
  inputs: string;
  scope: string;
  verification: string;
};

export interface ParsedSpecTaskBlock {
  acceptanceCriteria: string[];
  index: number;
  kind: TaskKind;
  objective: string;
  raw: string;
  scope: string | null;
  title: string;
  verificationCommands: string[];
}

export interface SyncSpecTaskItemResult {
  action: 'created' | 'deleted' | 'skipped' | 'updated';
  reason: string | null;
  taskId: string;
}

export interface SyncSpecTasksResult {
  createdCount: number;
  deletedCount: number;
  parsedCount: number;
  skippedCount: number;
  tasks: SyncSpecTaskItemResult[];
  updatedCount: number;
}

export type SpecTaskSyncSnapshotStatus =
  | 'clean'
  | 'pending_sync'
  | 'parse_error'
  | 'conflict';

export interface SpecTaskSyncSnapshotItem {
  blockIndex: number;
  expectedTaskTitle: string;
  reason:
    | 'DUPLICATE_SOURCE_MAPPING'
    | 'FIELD_MISMATCH'
    | 'MISSING_TASK'
    | 'ORPHANED_TASK'
    | 'TASK_NOT_MUTABLE';
  taskId: string | null;
}

export interface SpecTaskSyncSnapshot {
  conflictCount: number;
  items: SpecTaskSyncSnapshotItem[];
  matchedCount: number;
  noteId: string;
  orphanedTaskCount: number;
  parseError: string | null;
  parsedCount: number;
  pendingCount: number;
  status: SpecTaskSyncSnapshotStatus;
  taskCount: number;
}

function throwInvalidSpecTask(message: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/spec-task-block-invalid',
    title: 'Spec Task Block Invalid',
    status: 409,
    detail: message,
  });
}

function assertSpecNote(note: NotePayload) {
  if (note.type === 'spec') {
    return;
  }

  throw new ProblemError({
    type: 'https://team-ai.dev/problems/spec-note-required',
    title: 'Spec Note Required',
    status: 409,
    detail: `Note ${note.id} is ${note.type}, expected spec`,
  });
}

function normalizeSectionName(value: string): keyof ParsedSpecTaskSectionMap {
  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case 'definition of done':
      return 'definitionOfDone';
    case 'inputs':
      return 'inputs';
    case 'scope':
      return 'scope';
    case 'verification':
      return 'verification';
    default:
      throwInvalidSpecTask(`Unsupported task section: ${value}`);
  }
}

function cleanBlockText(value: string): string {
  return value.trim().replace(/\n{3,}/g, '\n\n');
}

function splitListItems(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''))
    .filter((line) => line.length > 0);
}

function inferTaskKind(title: string, objective: string): TaskKind {
  const haystack = `${title}\n${objective}`.toLowerCase();

  if (
    haystack.startsWith('verify') ||
    haystack.includes(' verification') ||
    haystack.includes('验收') ||
    haystack.includes('验证')
  ) {
    return 'verify';
  }

  if (
    haystack.startsWith('review') ||
    haystack.includes(' code review') ||
    haystack.includes('评审') ||
    haystack.includes('审查')
  ) {
    return 'review';
  }

  if (
    haystack.startsWith('plan') ||
    haystack.includes('planning') ||
    haystack.includes('拆分') ||
    haystack.includes('规划')
  ) {
    return 'plan';
  }

  return 'implement';
}

function roleForTaskKind(kind: TaskKind): string {
  switch (kind) {
    case 'plan':
      return 'ROUTA';
    case 'review':
    case 'verify':
      return 'GATE';
    case 'implement':
    default:
      return 'CRAFTER';
  }
}

function parseTaskBlock(rawBlock: string, index: number): ParsedSpecTaskBlock {
  const trimmed = cleanBlockText(rawBlock);
  if (!trimmed) {
    throwInvalidSpecTask(`Task block ${index + 1} is empty`);
  }

  const lines = trimmed.split('\n');
  const titleLine = lines.find((line) => line.trim().length > 0);
  if (!titleLine || !titleLine.trim().startsWith('# ')) {
    throwInvalidSpecTask(
      `Task block ${index + 1} must start with a "# " title line`,
    );
  }

  const title = titleLine.trim().slice(2).trim();
  if (!title) {
    throwInvalidSpecTask(`Task block ${index + 1} is missing a title`);
  }

  const sections: ParsedSpecTaskSectionMap = {
    body: '',
    definitionOfDone: '',
    inputs: '',
    scope: '',
    verification: '',
  };

  let currentSection: keyof ParsedSpecTaskSectionMap = 'body';
  const startIndex = lines.indexOf(titleLine) + 1;
  for (const line of lines.slice(startIndex)) {
    const sectionMatch = line.trim().match(/^##\s+(.+)$/);
    if (sectionMatch) {
      currentSection = normalizeSectionName(sectionMatch[1]);
      continue;
    }

    sections[currentSection] += `${line}\n`;
  }

  const objective = cleanBlockText(sections.body);
  if (!objective) {
    throwInvalidSpecTask(`Task block ${index + 1} is missing a task body`);
  }

  const acceptanceCriteria = splitListItems(sections.definitionOfDone);
  const verificationCommands = splitListItems(sections.verification);
  const scope = cleanBlockText(sections.scope);
  const kind = inferTaskKind(title, objective);

  return {
    acceptanceCriteria,
    index,
    kind,
    objective,
    raw: rawBlock,
    scope: scope || null,
    title,
    verificationCommands,
  };
}

export function parseSpecTaskBlocks(content: string): ParsedSpecTaskBlock[] {
  const blocks: string[] = [];
  const lines = content.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== '@@@task') {
      continue;
    }

    const blockLines: string[] = [];
    let endIndex = index + 1;
    while (endIndex < lines.length && lines[endIndex].trim() !== '@@@') {
      blockLines.push(lines[endIndex]);
      endIndex += 1;
    }

    if (endIndex >= lines.length) {
      throwInvalidSpecTask(
        `Task block ${blocks.length + 1} is missing a closing "@@@" marker`,
      );
    }

    blocks.push(blockLines.join('\n'));
    index = endIndex;
  }

  return blocks.map((block, index) => parseTaskBlock(block, index));
}

function isMutableSpecTask(task: TaskPayload): boolean {
  return (
    !task.executionSessionId &&
    !task.resultSessionId &&
    mutableSpecTaskStatuses.has(task.status)
  );
}

function parseSpecTaskBlocksSafely(
  content: string,
): { blocks: ParsedSpecTaskBlock[]; error: string | null } {
  try {
    return {
      blocks: parseSpecTaskBlocks(content),
      error: null,
    };
  } catch (error) {
    if (error instanceof ProblemError) {
      return {
        blocks: [],
        error: error.message,
      };
    }

    throw error;
  }
}

function listSpecNoteTasks(sqlite: Database, noteId: string): TaskPayload[] {
  const rows = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          board_id,
          column_id,
          position,
          priority,
          labels_json,
          assignee,
          assigned_provider,
          assigned_role,
          assigned_specialist_id,
          assigned_specialist_name,
          codebase_id,
          dependencies_json,
          parallel_group,
          acceptance_criteria_json,
          objective,
          scope,
          kind,
          verification_commands_json,
          completion_summary,
          verification_verdict,
          verification_report,
          parent_task_id,
          execution_session_id,
          result_session_id,
          session_id,
          trigger_session_id,
          github_id,
          github_number,
          github_url,
          github_repo,
          github_state,
          github_synced_at,
          last_sync_error,
          source_type,
          source_event_id,
          source_entry_index,
          status,
          title,
          created_at,
          updated_at,
          worktree_id
        FROM project_tasks
        WHERE source_type = @sourceType
          AND source_event_id = @noteId
          AND deleted_at IS NULL
        ORDER BY source_entry_index ASC, updated_at DESC, created_at DESC
      `,
    )
    .all({
      noteId,
      sourceType: specTaskSourceType,
    }) as TaskRow[];

  return rows.map(mapSpecTaskRow);
}

type TaskRow = Parameters<typeof mapSpecTaskRow>[0];

function mapSpecTaskRow(row: {
  acceptance_criteria_json: string;
  assigned_provider: string | null;
  assigned_role: string | null;
  assigned_specialist_id: string | null;
  assigned_specialist_name: string | null;
  assignee: string | null;
  board_id: string | null;
  codebase_id: string | null;
  column_id: string | null;
  completion_summary: string | null;
  created_at: string;
  dependencies_json: string;
  github_id: string | null;
  github_number: number | null;
  github_repo: string | null;
  github_state: string | null;
  github_synced_at: string | null;
  github_url: string | null;
  id: string;
  kind: TaskKind | null;
  labels_json: string;
  last_sync_error: string | null;
  objective: string;
  execution_session_id: string | null;
  parallel_group: string | null;
  parent_task_id: string | null;
  position: number | null;
  priority: string | null;
  project_id: string;
  result_session_id: string | null;
  session_id: string | null;
  scope: string | null;
  source_entry_index: number | null;
  source_event_id: string | null;
  source_type: string;
  status: string;
  title: string;
  trigger_session_id: string | null;
  updated_at: string;
  verification_commands_json: string;
  verification_report: string | null;
  verification_verdict: string | null;
  worktree_id: string | null;
}): TaskPayload {
  const parseStringArray = (value: string): string[] => {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  };

  return {
    acceptanceCriteria: parseStringArray(row.acceptance_criteria_json),
    assignedProvider: row.assigned_provider,
    assignedRole: row.assigned_role,
    assignedSpecialistId: row.assigned_specialist_id,
    assignedSpecialistName: row.assigned_specialist_name,
    assignee: row.assignee,
    boardId: row.board_id,
    codebaseId: row.codebase_id,
    columnId: row.column_id,
    completionSummary: row.completion_summary,
    createdAt: row.created_at,
    dependencies: parseStringArray(row.dependencies_json),
    executionSessionId: row.execution_session_id,
    githubId: row.github_id,
    githubNumber: row.github_number,
    githubRepo: row.github_repo,
    githubState: row.github_state,
    githubSyncedAt: row.github_synced_at,
    githubUrl: row.github_url,
    id: row.id,
    kind: row.kind,
    laneHandoffs: [],
    laneSessions: [],
    labels: parseStringArray(row.labels_json),
    lastSyncError: row.last_sync_error,
    objective: row.objective,
    parallelGroup: row.parallel_group,
    parentTaskId: row.parent_task_id,
    position: row.position,
    priority: row.priority,
    projectId: row.project_id,
    resultSessionId: row.result_session_id,
    sessionIds: row.session_id ? [row.session_id] : [],
    sessionId: row.session_id,
    scope: row.scope,
    sourceEntryIndex: row.source_entry_index,
    sourceEventId: row.source_event_id,
    sourceType: row.source_type,
    status: row.status,
    title: row.title,
    triggerSessionId: row.trigger_session_id,
    updatedAt: row.updated_at,
    verificationCommands: parseStringArray(row.verification_commands_json),
    verificationReport: row.verification_report,
    verificationVerdict: row.verification_verdict,
    workspaceId: row.project_id,
    codebaseIds: row.codebase_id ? [row.codebase_id] : [],
    worktreeId: row.worktree_id,
  };
}

function specTaskMatchesBlock(
  task: TaskPayload,
  block: ParsedSpecTaskBlock,
): boolean {
  const hasMatchingAssignedRole = task.assignedSpecialistId
    ? true
    : task.assignedRole === roleForTaskKind(block.kind);

  return (
    task.kind === block.kind &&
    task.title === block.title &&
    task.objective === block.objective &&
    (task.scope ?? null) === block.scope &&
    hasMatchingAssignedRole &&
    JSON.stringify(task.acceptanceCriteria) ===
      JSON.stringify(block.acceptanceCriteria) &&
    JSON.stringify(task.verificationCommands) ===
      JSON.stringify(block.verificationCommands)
  );
}

export function getSpecNoteTaskSyncSnapshot(
  sqlite: Database,
  note: NotePayload,
): SpecTaskSyncSnapshot {
  assertSpecNote(note);

  const parsed = parseSpecTaskBlocksSafely(note.content);
  const tasks = listSpecNoteTasks(sqlite, note.id);

  if (parsed.error) {
    return {
      conflictCount: 0,
      items: [],
      matchedCount: 0,
      noteId: note.id,
      orphanedTaskCount: 0,
      parseError: parsed.error,
      parsedCount: 0,
      pendingCount: 0,
      status: 'parse_error',
      taskCount: tasks.length,
    };
  }

  const items: SpecTaskSyncSnapshotItem[] = [];
  const tasksByIndex = new Map<number, TaskPayload>();
  let conflictCount = 0;
  let matchedCount = 0;
  let orphanedTaskCount = 0;
  let pendingCount = 0;

  for (const task of tasks) {
    const entryIndex = task.sourceEntryIndex;
    if (entryIndex === null || entryIndex === undefined) {
      conflictCount += 1;
      items.push({
        blockIndex: -1,
        expectedTaskTitle: task.title,
        reason: 'DUPLICATE_SOURCE_MAPPING',
        taskId: task.id,
      });
      continue;
    }

    if (tasksByIndex.has(entryIndex)) {
      conflictCount += 1;
      items.push({
        blockIndex: entryIndex,
        expectedTaskTitle: task.title,
        reason: 'DUPLICATE_SOURCE_MAPPING',
        taskId: task.id,
      });
      continue;
    }

    tasksByIndex.set(entryIndex, task);
  }

  for (const block of parsed.blocks) {
    const task = tasksByIndex.get(block.index);
    if (!task) {
      pendingCount += 1;
      items.push({
        blockIndex: block.index,
        expectedTaskTitle: block.title,
        reason: 'MISSING_TASK',
        taskId: null,
      });
      continue;
    }

    if (specTaskMatchesBlock(task, block)) {
      matchedCount += 1;
      continue;
    }

    if (!isMutableSpecTask(task)) {
      conflictCount += 1;
      items.push({
        blockIndex: block.index,
        expectedTaskTitle: block.title,
        reason: 'TASK_NOT_MUTABLE',
        taskId: task.id,
      });
      continue;
    }

    pendingCount += 1;
    items.push({
      blockIndex: block.index,
      expectedTaskTitle: block.title,
      reason: 'FIELD_MISMATCH',
      taskId: task.id,
    });
  }

  for (const [blockIndex, task] of tasksByIndex.entries()) {
    if (parsed.blocks.some((block) => block.index === blockIndex)) {
      continue;
    }

    orphanedTaskCount += 1;
    pendingCount += 1;
    items.push({
      blockIndex,
      expectedTaskTitle: task.title,
      reason: 'ORPHANED_TASK',
      taskId: task.id,
    });
  }

  return {
    conflictCount,
    items,
    matchedCount,
    noteId: note.id,
    orphanedTaskCount,
    parseError: null,
    parsedCount: parsed.blocks.length,
    pendingCount,
    status:
      conflictCount > 0
        ? 'conflict'
        : pendingCount > 0
          ? 'pending_sync'
          : 'clean',
    taskCount: tasks.length,
  };
}

function getSourceTaskId(
  sqlite: Database,
  noteId: string,
  index: number,
): string | null {
  const row = sqlite
    .prepare(
      `
        SELECT id
        FROM project_tasks
        WHERE source_type = @sourceType
          AND source_event_id = @sourceEventId
          AND source_entry_index = @sourceEntryIndex
          AND deleted_at IS NULL
        LIMIT 1
      `,
    )
    .get({
      sourceEntryIndex: index,
      sourceEventId: noteId,
      sourceType: specTaskSourceType,
    }) as { id: string } | undefined;

  return row?.id ?? null;
}

export async function syncSpecNoteToTasks(
  sqlite: Database,
  note: NotePayload,
): Promise<SyncSpecTasksResult> {
  assertSpecNote(note);

  const parsedBlocks = parseSpecTaskBlocks(note.content);
  const parsedIndexes = new Set(parsedBlocks.map((block) => block.index));
  const existingTasks = listSpecNoteTasks(sqlite, note.id);
  const tasks: SyncSpecTaskItemResult[] = [];
  let createdCount = 0;
  let deletedCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;

  for (const block of parsedBlocks) {
    const existingTaskId = getSourceTaskId(sqlite, note.id, block.index);
    if (!existingTaskId) {
      const task = await createTask(sqlite, {
        acceptanceCriteria: block.acceptanceCriteria,
        assignedRole: roleForTaskKind(block.kind),
        kind: block.kind,
        objective: block.objective,
        projectId: note.projectId,
        scope: block.scope,
        sessionId: note.sessionId,
        sourceEntryIndex: block.index,
        sourceEventId: note.id,
        sourceType: specTaskSourceType,
        title: block.title,
        verificationCommands: block.verificationCommands,
      });
      tasks.push({
        action: 'created',
        reason: null,
        taskId: task.id,
      });
      createdCount += 1;
      continue;
    }

    const currentTask = await getTaskById(sqlite, existingTaskId);
    if (!isMutableSpecTask(currentTask)) {
      tasks.push({
        action: 'skipped',
        reason: 'TASK_NOT_MUTABLE',
        taskId: currentTask.id,
      });
      skippedCount += 1;
      continue;
    }

    const updatedTask = await updateTask(sqlite, currentTask.id, {
      acceptanceCriteria: block.acceptanceCriteria,
      assignedRole: currentTask.assignedSpecialistId
        ? currentTask.assignedRole
        : roleForTaskKind(block.kind),
      kind: block.kind,
      objective: block.objective,
      scope: block.scope,
      sessionId: note.sessionId,
      title: block.title,
      verificationCommands: block.verificationCommands,
    });
    tasks.push({
      action: 'updated',
      reason: null,
      taskId: updatedTask.id,
    });
    updatedCount += 1;
  }

  for (const task of existingTasks) {
    if (
      task.sourceEntryIndex === null ||
      parsedIndexes.has(task.sourceEntryIndex)
    ) {
      continue;
    }

    if (!isMutableSpecTask(task)) {
      tasks.push({
        action: 'skipped',
        reason: 'TASK_NOT_MUTABLE',
        taskId: task.id,
      });
      skippedCount += 1;
      continue;
    }

    await deleteTask(sqlite, task.id);
    tasks.push({
      action: 'deleted',
      reason: 'BLOCK_REMOVED',
      taskId: task.id,
    });
    deletedCount += 1;
  }

  return {
    createdCount,
    deletedCount,
    parsedCount: parsedBlocks.length,
    skippedCount,
    tasks,
    updatedCount,
  };
}
