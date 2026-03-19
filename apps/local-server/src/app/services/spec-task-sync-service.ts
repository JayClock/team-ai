import type { Database } from 'better-sqlite3';
import { ProblemError } from '@orchestration/runtime-acp';
import type { NotePayload } from '../schemas/note';
import type { CreateTaskInput, TaskKind, TaskPayload } from '../schemas/task';
import { findSpecNoteByScope, getNoteById } from './note-service';
import { getProjectById } from './project-service';
import { ensureDefaultKanbanBoard } from './kanban-board-service';
import {
  createTask,
  deleteTask,
  getTaskById,
  updateTask,
} from './task-service';

interface ParsedSpecTaskBlock {
  acceptanceCriteria: string[];
  dependencies: string[];
  index: number;
  kind: TaskKind;
  owner: string | null;
  objective: string;
  scope: string | null;
  title: string;
  verificationCommands: string[];
}

export interface SpecTaskSyncResult {
  archivedTaskIds: string[];
  createdTaskIds: string[];
  note: NotePayload;
  parsedTaskCount: number;
  updatedTaskIds: string[];
}

function normalizeLines(content: string) {
  return content.replace(/\r\n/g, '\n');
}

function splitListItems(lines: string[]) {
  const items: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      items.push(bulletMatch[1].trim());
      continue;
    }

    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      items.push(numberedMatch[1].trim());
      continue;
    }

    items.push(trimmed);
  }

  return items;
}

function inferTaskKind(title: string, owner: string | null) {
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedOwner = owner?.trim().toLowerCase() ?? '';

  if (
    normalizedOwner.includes('gate') ||
    normalizedOwner.includes('review') ||
    normalizedTitle.startsWith('review') ||
    normalizedTitle.startsWith('verify')
  ) {
    return normalizedTitle.startsWith('verify') ? 'verify' : 'review';
  }

  if (
    normalizedOwner.includes('routa') ||
    normalizedOwner.includes('todo') ||
    normalizedTitle.startsWith('plan') ||
    normalizedTitle.startsWith('backlog')
  ) {
    return 'plan';
  }

  return 'implement';
}

function resolveOwnerAssignment(owner: string | null) {
  const normalizedOwner = owner?.trim().toLowerCase() ?? '';

  if (
    normalizedOwner.includes('gate') ||
    normalizedOwner.includes('review') ||
    normalizedOwner.includes('done')
  ) {
    return {
      assignedRole: 'GATE',
      assignedSpecialistId: 'gate-reviewer',
    } as const;
  }

  if (
    normalizedOwner.includes('blocked') ||
    normalizedOwner.includes('resolver')
  ) {
    return {
      assignedRole: 'ROUTA',
      assignedSpecialistId: 'blocked-resolver',
    } as const;
  }

  if (
    normalizedOwner.includes('todo') ||
    normalizedOwner.includes('orchestrator') ||
    normalizedOwner.includes('routa')
  ) {
    return {
      assignedRole: 'ROUTA',
      assignedSpecialistId: 'todo-orchestrator',
    } as const;
  }

  if (
    normalizedOwner.includes('crafter') ||
    normalizedOwner.includes('developer') ||
    normalizedOwner.includes('implementor')
  ) {
    return {
      assignedRole: 'CRAFTER',
      assignedSpecialistId: 'crafter-implementor',
    } as const;
  }

  return {
    assignedRole: null,
    assignedSpecialistId: null,
  } as const;
}

function parseSpecTaskBlocks(content: string): ParsedSpecTaskBlock[] {
  const normalizedContent = normalizeLines(content);
  const matcher = /@@@task\s*\n([\s\S]*?)\n@@@/g;
  const blocks: ParsedSpecTaskBlock[] = [];
  let match: RegExpExecArray | null = matcher.exec(normalizedContent);

  while (match) {
    const blockBody = match[1]?.trim() ?? '';
    const lines = blockBody.split('\n');
    let title = '';
    let owner: string | null = null;
    const objectiveLines: string[] = [];
    const sections = new Map<string, string[]>();
    let currentSection = '';

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();

      if (!title && /^#\s+/.test(trimmed)) {
        title = trimmed.replace(/^#\s+/, '').trim();
        continue;
      }

      const sectionMatch = trimmed.match(/^##\s+(.+)$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim().toLowerCase();
        sections.set(currentSection, []);
        continue;
      }

      if (!title && trimmed) {
        title = trimmed;
        continue;
      }

      if (currentSection) {
        sections.get(currentSection)?.push(line);
      } else {
        objectiveLines.push(line);
      }
    }

    if (title) {
      const ownerSection =
        sections.get('owner') ??
        sections.get('assignee') ??
        sections.get('specialist') ??
        [];
      owner = ownerSection.map((line) => line.trim()).find(Boolean) ?? null;
      const acceptanceCriteria =
        splitListItems(
          sections.get('definition of done') ??
            sections.get('acceptance criteria') ??
            [],
        );
      const verificationCommands =
        splitListItems(sections.get('verification') ?? []);
      const dependencies =
        splitListItems(
          sections.get('depends on') ?? sections.get('dependencies') ?? [],
        );
      const scopeLines = sections.get('scope') ?? [];
      const objective = objectiveLines.join('\n').trim() || title;

      blocks.push({
        acceptanceCriteria,
        dependencies,
        index: blocks.length,
        kind: inferTaskKind(title, owner),
        objective,
        owner,
        scope: scopeLines.join('\n').trim() || null,
        title,
        verificationCommands,
      });
    }

    match = matcher.exec(normalizedContent);
  }

  return blocks;
}

function listSpecNoteTaskRows(sqlite: Database, noteId: string) {
  return sqlite
    .prepare(
      `
        SELECT id
        FROM project_tasks
        WHERE source_type = 'spec_note'
          AND source_event_id = ?
          AND deleted_at IS NULL
        ORDER BY source_entry_index ASC, created_at ASC
      `,
    )
    .all(noteId) as Array<{ id: string }>;
}

async function listSpecNoteTasks(sqlite: Database, noteId: string) {
  const rows = listSpecNoteTaskRows(sqlite, noteId);
  return await Promise.all(rows.map((row) => getTaskById(sqlite, row.id)));
}

function buildDependencyLookup(tasks: TaskPayload[]) {
  const byNormalizedTitle = new Map<string, string>();

  for (const task of tasks) {
    byNormalizedTitle.set(task.title.trim().toLowerCase(), task.id);
  }

  return byNormalizedTitle;
}

function resolveDependencyIds(
  block: ParsedSpecTaskBlock,
  titleToTaskId: Map<string, string>,
) {
  const dependencyIds = new Set<string>();

  for (const dependency of block.dependencies) {
    const normalizedDependency = dependency.trim().toLowerCase();
    const directMatch = titleToTaskId.get(normalizedDependency);
    if (directMatch) {
      dependencyIds.add(directMatch);
      continue;
    }

    const blockMatch = normalizedDependency.match(/^block\s+#?(\d+)$/);
    if (blockMatch) {
      const blockIndex = Number(blockMatch[1]) - 1;
      const indexedMatch = [...titleToTaskId.entries()][blockIndex]?.[1];
      if (indexedMatch) {
        dependencyIds.add(indexedMatch);
      }
    }
  }

  return [...dependencyIds];
}

function throwSpecNoteMissing(
  projectId: string,
  sessionId: string | null,
  noteId?: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/spec-note-missing',
    title: 'Spec Note Missing',
    status: 404,
    detail: noteId
      ? `Spec note ${noteId} was not found for project ${projectId}`
      : sessionId
        ? `No canonical spec note exists for project ${projectId} and session ${sessionId}`
        : `No project-scoped canonical spec note exists for project ${projectId}`,
  });
}

export async function syncSpecTasks(
  sqlite: Database,
  input: {
    noteId?: string;
    projectId: string;
    sessionId?: string | null;
  },
): Promise<SpecTaskSyncResult> {
  await getProjectById(sqlite, input.projectId);
  const sessionId = input.sessionId ?? null;
  const note = input.noteId
    ? await getNoteById(sqlite, input.noteId)
    : await findSpecNoteByScope(sqlite, {
        projectId: input.projectId,
        sessionId,
      });

  if (!note || note.type !== 'spec' || note.projectId !== input.projectId) {
    throwSpecNoteMissing(input.projectId, sessionId, input.noteId);
  }

  if (input.sessionId !== undefined && note.sessionId !== sessionId) {
    throwSpecNoteMissing(input.projectId, sessionId, input.noteId);
  }

  const board = await ensureDefaultKanbanBoard(sqlite, note.projectId);
  const parsedBlocks = parseSpecTaskBlocks(note.content);
  const existingTasks = await listSpecNoteTasks(sqlite, note.id);
  const existingByIndex = new Map(
    existingTasks.map((task) => [task.sourceEntryIndex ?? -1, task]),
  );
  const createdTaskIds: string[] = [];
  const updatedTaskIds: string[] = [];
  const archivedTaskIds: string[] = [];
  const syncedTasks: TaskPayload[] = [];

  for (const block of parsedBlocks) {
    const ownerAssignment = resolveOwnerAssignment(block.owner);
    const existing = existingByIndex.get(block.index);
    if (existing) {
      const updated = await updateTask(sqlite, existing.id, {
        acceptanceCriteria: block.acceptanceCriteria,
        assignedRole:
          ownerAssignment.assignedRole ?? existing.assignedRole,
        assignedSpecialistId:
          ownerAssignment.assignedSpecialistId ?? existing.assignedSpecialistId,
        dependencies: [],
        kind: block.kind,
        objective: block.objective,
        scope: block.scope,
        sessionId: note.sessionId,
        sourceEntryIndex: block.index,
        sourceEventId: note.id,
        sourceType: 'spec_note',
        title: block.title,
        verificationCommands: block.verificationCommands,
      });
      updatedTaskIds.push(updated.id);
      syncedTasks.push(updated);
      continue;
    }

    const createInput: CreateTaskInput = {
      acceptanceCriteria: block.acceptanceCriteria,
      assignedRole: ownerAssignment.assignedRole,
      assignedSpecialistId: ownerAssignment.assignedSpecialistId,
      boardId: board.id,
      kind: block.kind,
      objective: block.objective,
      projectId: note.projectId,
      scope: block.scope,
      sessionId: note.sessionId,
      sourceEntryIndex: block.index,
      sourceEventId: note.id,
      sourceType: 'spec_note',
      title: block.title,
      verificationCommands: block.verificationCommands,
    };
    const created = await createTask(sqlite, createInput);
    createdTaskIds.push(created.id);
    syncedTasks.push(created);
  }

  for (const task of existingTasks) {
    if ((task.sourceEntryIndex ?? -1) < parsedBlocks.length) {
      continue;
    }

    await deleteTask(sqlite, task.id);
    archivedTaskIds.push(task.id);
  }

  const dependencyLookup = buildDependencyLookup(syncedTasks);

  for (const block of parsedBlocks) {
    const task = syncedTasks.find((candidate) => candidate.sourceEntryIndex === block.index);
    if (!task) {
      continue;
    }

    const dependencyIds = resolveDependencyIds(block, dependencyLookup).filter(
      (dependencyId) => dependencyId !== task.id,
    );
    const dependenciesChanged =
      dependencyIds.length !== task.dependencies.length ||
      dependencyIds.some((dependencyId, index) => task.dependencies[index] !== dependencyId);

    if (dependenciesChanged) {
      await updateTask(sqlite, task.id, {
        dependencies: dependencyIds,
      });
    }
  }

  return {
    archivedTaskIds,
    createdTaskIds,
    note,
    parsedTaskCount: parsedBlocks.length,
    updatedTaskIds,
  };
}
