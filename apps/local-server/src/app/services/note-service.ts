import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { ProblemError } from '@orchestration/runtime-acp';
import { getDrizzleDb } from '../db/drizzle';
import { projectNotesTable } from '../db/schema';
import type {
  CreateNoteInput,
  NoteListPayload,
  NotePayload,
  NoteType,
  UpdateNoteInput,
} from '../schemas/note';
import { getAcpSessionById } from './acp-service';
import { getProjectById } from './project-service';
import { getTaskById } from './task-service';

const noteIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface NoteRow {
  assigned_agent_ids_json: string;
  content: string;
  created_at: string;
  format: 'markdown';
  id: string;
  linked_task_id: string | null;
  parent_note_id: string | null;
  project_id: string;
  session_id: string | null;
  source: 'user' | 'agent' | 'system';
  title: string;
  type: NoteType;
  updated_at: string;
}

interface ListNotesQuery {
  page: number;
  pageSize: number;
  projectId: string;
  sessionId?: string;
  type?: NoteType;
}

function createNoteId() {
  return `note_${noteIdGenerator()}`;
}

function combineFilters(filters: SQL<unknown>[]) {
  if (filters.length === 0) {
    return undefined;
  }

  return filters.length === 1 ? filters[0] : and(...filters);
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function mapNoteRow(row: NoteRow): NotePayload {
  return {
    assignedAgentIds: parseStringArray(row.assigned_agent_ids_json),
    content: row.content,
    createdAt: row.created_at,
    format: row.format,
    id: row.id,
    linkedTaskId: row.linked_task_id,
    parentNoteId: row.parent_note_id,
    projectId: row.project_id,
    sessionId: row.session_id,
    source: row.source,
    title: row.title,
    type: row.type,
    updatedAt: row.updated_at,
  };
}

function throwNoteNotFound(noteId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/note-not-found',
    title: 'Note Not Found',
    status: 404,
    detail: `Note ${noteId} was not found`,
  });
}

function throwNoteSessionProjectMismatch(
  projectId: string,
  sessionId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/note-session-project-mismatch',
    title: 'Note Session Project Mismatch',
    status: 409,
    detail: `Note project ${projectId} does not match session ${sessionId}`,
  });
}

function throwNoteTaskProjectMismatch(
  projectId: string,
  taskId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/note-task-project-mismatch',
    title: 'Note Task Project Mismatch',
    status: 409,
    detail: `Note project ${projectId} does not match task ${taskId}`,
  });
}

function throwNoteParentProjectMismatch(
  projectId: string,
  noteId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/note-parent-project-mismatch',
    title: 'Note Parent Project Mismatch',
    status: 409,
    detail: `Note project ${projectId} does not match parent note ${noteId}`,
  });
}

function throwNoteParentSelfReference(noteId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/note-parent-self-reference',
    title: 'Note Parent Self Reference',
    status: 409,
    detail: `Note ${noteId} cannot be its own parent`,
  });
}

function getNoteRow(sqlite: Database, noteId: string): NoteRow {
  const row = getDrizzleDb(sqlite)
    .select({
      assigned_agent_ids_json: projectNotesTable.assignedAgentIdsJson,
      content: projectNotesTable.content,
      created_at: projectNotesTable.createdAt,
      format: projectNotesTable.format,
      id: projectNotesTable.id,
      linked_task_id: projectNotesTable.linkedTaskId,
      parent_note_id: projectNotesTable.parentNoteId,
      project_id: projectNotesTable.projectId,
      session_id: projectNotesTable.sessionId,
      source: projectNotesTable.source,
      title: projectNotesTable.title,
      type: projectNotesTable.type,
      updated_at: projectNotesTable.updatedAt,
    })
    .from(projectNotesTable)
    .where(
      and(
        eq(projectNotesTable.id, noteId),
        isNull(projectNotesTable.deletedAt),
      ),
    )
    .get() as NoteRow | undefined;

  if (!row) {
    throwNoteNotFound(noteId);
  }

  return row;
}

async function ensureSessionProjectMatch(
  sqlite: Database,
  projectId: string,
  sessionId: string | null | undefined,
) {
  if (!sessionId) {
    return null;
  }

  const session = await getAcpSessionById(sqlite, sessionId);

  if (session.project.id !== projectId) {
    throwNoteSessionProjectMismatch(projectId, sessionId);
  }

  return session.id;
}

async function ensureTaskProjectMatch(
  sqlite: Database,
  projectId: string,
  taskId: string | null | undefined,
) {
  if (!taskId) {
    return null;
  }

  const task = await getTaskById(sqlite, taskId);

  if (task.projectId !== projectId) {
    throwNoteTaskProjectMismatch(projectId, taskId);
  }

  return task.id;
}

function ensureParentProjectMatch(
  sqlite: Database,
  projectId: string,
  noteId: string,
  parentNoteId: string | null | undefined,
) {
  if (!parentNoteId) {
    return null;
  }

  if (parentNoteId === noteId) {
    throwNoteParentSelfReference(noteId);
  }

  const parent = getNoteRow(sqlite, parentNoteId);

  if (parent.project_id !== projectId) {
    throwNoteParentProjectMismatch(projectId, parentNoteId);
  }

  return parent.id;
}

export async function listNotes(
  sqlite: Database,
  query: ListNotesQuery,
): Promise<NoteListPayload> {
  const { page, pageSize, projectId, sessionId, type } = query;
  await getProjectById(sqlite, projectId);
  await ensureSessionProjectMatch(sqlite, projectId, sessionId);

  const offset = (page - 1) * pageSize;
  const filters: SQL<unknown>[] = [
    eq(projectNotesTable.projectId, projectId),
    isNull(projectNotesTable.deletedAt),
  ];

  if (sessionId) {
    filters.push(eq(projectNotesTable.sessionId, sessionId));
  }

  if (type) {
    filters.push(eq(projectNotesTable.type, type));
  }

  const whereClause = combineFilters(filters);
  const items = getDrizzleDb(sqlite)
    .select({
      assigned_agent_ids_json: projectNotesTable.assignedAgentIdsJson,
      content: projectNotesTable.content,
      created_at: projectNotesTable.createdAt,
      format: projectNotesTable.format,
      id: projectNotesTable.id,
      linked_task_id: projectNotesTable.linkedTaskId,
      parent_note_id: projectNotesTable.parentNoteId,
      project_id: projectNotesTable.projectId,
      session_id: projectNotesTable.sessionId,
      source: projectNotesTable.source,
      title: projectNotesTable.title,
      type: projectNotesTable.type,
      updated_at: projectNotesTable.updatedAt,
    })
    .from(projectNotesTable)
    .where(whereClause)
    .orderBy(desc(projectNotesTable.updatedAt))
    .limit(pageSize)
    .offset(offset)
    .all() as NoteRow[];

  const total = getDrizzleDb(sqlite)
    .select({
      count: sql<number>`count(*)`,
    })
    .from(projectNotesTable)
    .where(whereClause)
    .get() as { count: number };

  return {
    items: items.map(mapNoteRow),
    page,
    pageSize,
    projectId,
    sessionId,
    total: total.count,
    type,
  };
}

export async function getNoteById(
  sqlite: Database,
  noteId: string,
): Promise<NotePayload> {
  return mapNoteRow(getNoteRow(sqlite, noteId));
}

export async function findSpecNoteByScope(
  sqlite: Database,
  input: {
    projectId: string;
    sessionId?: string | null;
  },
): Promise<NotePayload | null> {
  await getProjectById(sqlite, input.projectId);
  await ensureSessionProjectMatch(sqlite, input.projectId, input.sessionId);

  const row = getDrizzleDb(sqlite)
    .select({
      assigned_agent_ids_json: projectNotesTable.assignedAgentIdsJson,
      content: projectNotesTable.content,
      created_at: projectNotesTable.createdAt,
      format: projectNotesTable.format,
      id: projectNotesTable.id,
      linked_task_id: projectNotesTable.linkedTaskId,
      parent_note_id: projectNotesTable.parentNoteId,
      project_id: projectNotesTable.projectId,
      session_id: projectNotesTable.sessionId,
      source: projectNotesTable.source,
      title: projectNotesTable.title,
      type: projectNotesTable.type,
      updated_at: projectNotesTable.updatedAt,
    })
    .from(projectNotesTable)
    .where(
      and(
        eq(projectNotesTable.projectId, input.projectId),
        eq(projectNotesTable.type, 'spec'),
        isNull(projectNotesTable.deletedAt),
        input.sessionId == null
          ? isNull(projectNotesTable.sessionId)
          : eq(projectNotesTable.sessionId, input.sessionId),
      ),
    )
    .orderBy(
      desc(projectNotesTable.updatedAt),
      desc(projectNotesTable.createdAt),
    )
    .limit(1)
    .get() as NoteRow | undefined;

  return row ? mapNoteRow(row) : null;
}

export async function findLatestTaskNote(
  sqlite: Database,
  input: {
    projectId: string;
    sessionId?: string | null;
    taskId: string;
    title?: string;
    type?: NoteType;
  },
): Promise<NotePayload | null> {
  await getProjectById(sqlite, input.projectId);
  await ensureSessionProjectMatch(sqlite, input.projectId, input.sessionId);
  await ensureTaskProjectMatch(sqlite, input.projectId, input.taskId);

  const filters: SQL<unknown>[] = [
    eq(projectNotesTable.projectId, input.projectId),
    eq(projectNotesTable.linkedTaskId, input.taskId),
    isNull(projectNotesTable.deletedAt),
  ];

  if (input.sessionId === null || input.sessionId === undefined) {
    filters.push(isNull(projectNotesTable.sessionId));
  } else {
    filters.push(eq(projectNotesTable.sessionId, input.sessionId));
  }

  if (input.type) {
    filters.push(eq(projectNotesTable.type, input.type));
  }

  if (input.title) {
    filters.push(eq(projectNotesTable.title, input.title));
  }

  const row = getDrizzleDb(sqlite)
    .select({
      assigned_agent_ids_json: projectNotesTable.assignedAgentIdsJson,
      content: projectNotesTable.content,
      created_at: projectNotesTable.createdAt,
      format: projectNotesTable.format,
      id: projectNotesTable.id,
      linked_task_id: projectNotesTable.linkedTaskId,
      parent_note_id: projectNotesTable.parentNoteId,
      project_id: projectNotesTable.projectId,
      session_id: projectNotesTable.sessionId,
      source: projectNotesTable.source,
      title: projectNotesTable.title,
      type: projectNotesTable.type,
      updated_at: projectNotesTable.updatedAt,
    })
    .from(projectNotesTable)
    .where(combineFilters(filters))
    .orderBy(
      desc(projectNotesTable.updatedAt),
      desc(projectNotesTable.createdAt),
    )
    .limit(1)
    .get() as NoteRow | undefined;

  return row ? mapNoteRow(row) : null;
}

export async function createNote(
  sqlite: Database,
  input: CreateNoteInput,
): Promise<NotePayload> {
  await getProjectById(sqlite, input.projectId);

  const now = new Date().toISOString();
  const noteId = createNoteId();
  const sessionId = await ensureSessionProjectMatch(
    sqlite,
    input.projectId,
    input.sessionId,
  );
  const linkedTaskId = await ensureTaskProjectMatch(
    sqlite,
    input.projectId,
    input.linkedTaskId,
  );
  const parentNoteId = ensureParentProjectMatch(
    sqlite,
    input.projectId,
    noteId,
    input.parentNoteId,
  );
  const note: NotePayload = {
    assignedAgentIds: input.assignedAgentIds ?? [],
    content: input.content ?? '',
    createdAt: now,
    format: input.format ?? 'markdown',
    id: noteId,
    linkedTaskId,
    parentNoteId,
    projectId: input.projectId,
    sessionId,
    source: input.source ?? 'user',
    title: input.title,
    type: input.type ?? 'general',
    updatedAt: now,
  };

  getDrizzleDb(sqlite)
    .insert(projectNotesTable)
    .values({
      id: note.id,
      projectId: note.projectId,
      sessionId: note.sessionId,
      type: note.type,
      title: note.title,
      content: note.content,
      format: note.format,
      parentNoteId: note.parentNoteId,
      linkedTaskId: note.linkedTaskId,
      assignedAgentIdsJson: JSON.stringify(note.assignedAgentIds),
      source: note.source,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      deletedAt: null,
    })
    .run();

  return note;
}

export async function updateNote(
  sqlite: Database,
  noteId: string,
  input: UpdateNoteInput,
): Promise<NotePayload> {
  const current = getNoteRow(sqlite, noteId);
  const projectId = current.project_id;
  await getProjectById(sqlite, projectId);

  const sessionId =
    input.sessionId === undefined
      ? current.session_id
      : await ensureSessionProjectMatch(sqlite, projectId, input.sessionId);
  const linkedTaskId =
    input.linkedTaskId === undefined
      ? current.linked_task_id
      : await ensureTaskProjectMatch(sqlite, projectId, input.linkedTaskId);
  const parentNoteId =
    input.parentNoteId === undefined
      ? current.parent_note_id
      : ensureParentProjectMatch(sqlite, projectId, noteId, input.parentNoteId);
  const updated: NotePayload = {
    assignedAgentIds:
      input.assignedAgentIds ??
      parseStringArray(current.assigned_agent_ids_json),
    content: input.content ?? current.content,
    createdAt: current.created_at,
    format: input.format ?? current.format,
    id: current.id,
    linkedTaskId,
    parentNoteId,
    projectId,
    sessionId,
    source: input.source ?? current.source,
    title: input.title ?? current.title,
    type: input.type ?? current.type,
    updatedAt: new Date().toISOString(),
  };

  getDrizzleDb(sqlite)
    .update(projectNotesTable)
    .set({
      sessionId: updated.sessionId,
      type: updated.type,
      title: updated.title,
      content: updated.content,
      format: updated.format,
      parentNoteId: updated.parentNoteId,
      linkedTaskId: updated.linkedTaskId,
      assignedAgentIdsJson: JSON.stringify(updated.assignedAgentIds),
      source: updated.source,
      updatedAt: updated.updatedAt,
    })
    .where(
      and(
        eq(projectNotesTable.id, updated.id),
        isNull(projectNotesTable.deletedAt),
      ),
    )
    .run();

  return updated;
}

export async function deleteNote(
  sqlite: Database,
  noteId: string,
): Promise<NotePayload> {
  const note = mapNoteRow(getNoteRow(sqlite, noteId));

  const deletedAt = new Date().toISOString();
  getDrizzleDb(sqlite)
    .update(projectNotesTable)
    .set({
      deletedAt,
      updatedAt: deletedAt,
    })
    .where(
      and(
        eq(projectNotesTable.id, noteId),
        isNull(projectNotesTable.deletedAt),
      ),
    )
    .run();

  return note;
}
