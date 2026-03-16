import type { Database } from 'better-sqlite3';
import { ProblemError } from '../errors/problem-error';
import type { NotePayload } from '../schemas/note';
import type { TaskKind, TaskPayload } from '../schemas/task';
import { createTask, getTaskById, updateTask } from './task-service';

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
  action: 'created' | 'skipped' | 'updated';
  reason: string | null;
  taskId: string;
}

export interface SyncSpecTasksResult {
  createdCount: number;
  parsedCount: number;
  skippedCount: number;
  tasks: SyncSpecTaskItemResult[];
  updatedCount: number;
}

function throwInvalidSpecTask(message: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/spec-task-block-invalid',
    title: 'Spec Task Block Invalid',
    status: 409,
    detail: message,
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
  if (note.type !== 'spec') {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/spec-note-required',
      title: 'Spec Note Required',
      status: 409,
      detail: `Note ${note.id} is ${note.type}, expected spec`,
    });
  }

  const parsedBlocks = parseSpecTaskBlocks(note.content);
  const tasks: SyncSpecTaskItemResult[] = [];
  let createdCount = 0;
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

  return {
    createdCount,
    parsedCount: parsedBlocks.length,
    skippedCount,
    tasks,
    updatedCount,
  };
}

