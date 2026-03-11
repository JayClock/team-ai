import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
import type {
  CreateSessionInput,
  SessionContextPayload,
  SessionHistoryPayload,
  SessionListPayload,
  SessionPayload,
  UpdateSessionInput,
} from '../schemas/session';
import { getProjectById } from './project-service';

const sessionIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface SessionRow {
  created_at: string;
  id: string;
  metadata_json: string;
  parent_session_id: string | null;
  project_id: string;
  status: string;
  title: string;
  updated_at: string;
}

interface ListSessionsQuery {
  page: number;
  pageSize: number;
  projectId?: string;
  status?: string;
}

function createSessionId() {
  return `sess_${sessionIdGenerator()}`;
}

function parseMetadata(metadataJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapSessionRow(row: SessionRow): SessionPayload {
  return {
    createdAt: row.created_at,
    id: row.id,
    metadata: parseMetadata(row.metadata_json),
    parentSessionId: row.parent_session_id,
    projectId: row.project_id,
    status: row.status,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

function throwSessionNotFound(sessionId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/session-not-found',
    title: 'Session Not Found',
    status: 404,
    detail: `Session ${sessionId} was not found`,
  });
}

function throwParentProjectMismatch(
  sessionId: string,
  parentSessionId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/session-parent-project-mismatch',
    title: 'Session Parent Project Mismatch',
    status: 409,
    detail: `Session ${sessionId} cannot use parent session ${parentSessionId} from a different project`,
  });
}

function throwSessionHierarchyCycle(
  sessionId: string,
  parentSessionId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/session-hierarchy-cycle',
    title: 'Session Hierarchy Cycle',
    status: 409,
    detail: `Session ${sessionId} cannot use parent session ${parentSessionId} because it would create a cycle`,
  });
}

function getSessionRow(sqlite: Database, sessionId: string): SessionRow {
  const row = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          parent_session_id,
          title,
          status,
          metadata_json,
          created_at,
          updated_at
        FROM project_sessions
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(sessionId) as SessionRow | undefined;

  if (!row) {
    throwSessionNotFound(sessionId);
  }

  return row;
}

function validateParentSession(
  sqlite: Database,
  sessionId: string,
  projectId: string,
  parentSessionId?: string | null,
) {
  if (!parentSessionId) {
    return null;
  }

  if (parentSessionId === sessionId) {
    throwSessionHierarchyCycle(sessionId, parentSessionId);
  }

  let currentParentId: string | null = parentSessionId;

  while (currentParentId) {
    const parent = getSessionRow(sqlite, currentParentId);

    if (parent.project_id !== projectId) {
      throwParentProjectMismatch(sessionId, parentSessionId);
    }

    if (parent.parent_session_id === sessionId) {
      throwSessionHierarchyCycle(sessionId, parentSessionId);
    }

    currentParentId = parent.parent_session_id;
  }

  return parentSessionId;
}

export async function createSession(
  sqlite: Database,
  input: CreateSessionInput,
): Promise<SessionPayload> {
  await getProjectById(sqlite, input.projectId);

  const sessionId = createSessionId();
  const now = new Date().toISOString();
  const parentSessionId = validateParentSession(
    sqlite,
    sessionId,
    input.projectId,
    input.parentSessionId,
  );

  sqlite
    .prepare(
      `
        INSERT INTO project_sessions (
          id,
          project_id,
          parent_session_id,
          title,
          status,
          metadata_json,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          @id,
          @projectId,
          @parentSessionId,
          @title,
          @status,
          @metadataJson,
          @createdAt,
          @updatedAt,
          NULL
        )
      `,
    )
    .run({
      createdAt: now,
      id: sessionId,
      metadataJson: JSON.stringify(input.metadata ?? {}),
      parentSessionId,
      projectId: input.projectId,
      status: input.status ?? 'ACTIVE',
      title: input.title,
      updatedAt: now,
    });

  return getSessionById(sqlite, sessionId);
}

export async function listSessions(
  sqlite: Database,
  query: ListSessionsQuery,
): Promise<SessionListPayload> {
  const { page, pageSize, projectId, status } = query;

  if (projectId) {
    await getProjectById(sqlite, projectId);
  }

  const offset = (page - 1) * pageSize;
  const filters = ['deleted_at IS NULL'];
  const parameters: Record<string, unknown> = {
    limit: pageSize,
    offset,
  };

  if (projectId) {
    filters.push('project_id = @projectId');
    parameters.projectId = projectId;
  }

  if (status) {
    filters.push('status = @status');
    parameters.status = status;
  }

  const whereClause = filters.join(' AND ');

  const rows = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          parent_session_id,
          title,
          status,
          metadata_json,
          created_at,
          updated_at
        FROM project_sessions
        WHERE ${whereClause}
        ORDER BY updated_at DESC, created_at DESC
        LIMIT @limit OFFSET @offset
      `,
    )
    .all(parameters) as SessionRow[];

  const total = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM project_sessions
        WHERE ${whereClause}
      `,
    )
    .get(parameters) as { count: number };

  return {
    items: rows.map(mapSessionRow),
    page,
    pageSize,
    projectId,
    status,
    total: total.count,
  };
}

export async function getSessionById(
  sqlite: Database,
  sessionId: string,
): Promise<SessionPayload> {
  return mapSessionRow(getSessionRow(sqlite, sessionId));
}

export async function updateSession(
  sqlite: Database,
  sessionId: string,
  input: UpdateSessionInput,
): Promise<SessionPayload> {
  const current = getSessionRow(sqlite, sessionId);
  const parentSessionId =
    input.parentSessionId === undefined
      ? current.parent_session_id
      : validateParentSession(
          sqlite,
          sessionId,
          current.project_id,
          input.parentSessionId,
        );
  const next = {
    id: sessionId,
    metadataJson:
      input.metadata === undefined
        ? current.metadata_json
        : JSON.stringify(input.metadata),
    parentSessionId,
    status: input.status ?? current.status,
    title: input.title ?? current.title,
    updatedAt: new Date().toISOString(),
  };

  sqlite
    .prepare(
      `
        UPDATE project_sessions
        SET
          parent_session_id = @parentSessionId,
          title = @title,
          status = @status,
          metadata_json = @metadataJson,
          updated_at = @updatedAt
        WHERE id = @id AND deleted_at IS NULL
      `,
    )
    .run(next);

  return getSessionById(sqlite, sessionId);
}

export async function deleteSession(
  sqlite: Database,
  sessionId: string,
): Promise<void> {
  const result = sqlite
    .prepare(
      `
        UPDATE project_sessions
        SET
          deleted_at = @deletedAt,
          updated_at = @updatedAt
        WHERE id = @id AND deleted_at IS NULL
      `,
    )
    .run({
      deletedAt: new Date().toISOString(),
      id: sessionId,
      updatedAt: new Date().toISOString(),
    });

  if (result.changes === 0) {
    throwSessionNotFound(sessionId);
  }
}

export async function getSessionContext(
  sqlite: Database,
  sessionId: string,
): Promise<SessionContextPayload> {
  const current = getSessionRow(sqlite, sessionId);
  const children = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          parent_session_id,
          title,
          status,
          metadata_json,
          created_at,
          updated_at
        FROM project_sessions
        WHERE parent_session_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC, created_at DESC
      `,
    )
    .all(sessionId) as SessionRow[];

  const siblings = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          parent_session_id,
          title,
          status,
          metadata_json,
          created_at,
          updated_at
        FROM project_sessions
        WHERE project_id = @projectId
          AND ((parent_session_id = @parentSessionId) OR (parent_session_id IS NULL AND @parentSessionId IS NULL))
          AND id <> @sessionId
          AND deleted_at IS NULL
        ORDER BY updated_at DESC, created_at DESC
      `,
    )
    .all({
      parentSessionId: current.parent_session_id,
      projectId: current.project_id,
      sessionId,
    }) as SessionRow[];

  const recentInWorkspace = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          parent_session_id,
          title,
          status,
          metadata_json,
          created_at,
          updated_at
        FROM project_sessions
        WHERE project_id = ? AND id <> ? AND deleted_at IS NULL
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 10
      `,
    )
    .all(current.project_id, sessionId) as SessionRow[];

  return {
    children: children.map(mapSessionRow),
    current: mapSessionRow(current),
    parent: current.parent_session_id
      ? mapSessionRow(getSessionRow(sqlite, current.parent_session_id))
      : null,
    recentInWorkspace: recentInWorkspace.map(mapSessionRow),
    siblings: siblings.map(mapSessionRow),
  };
}

export async function getSessionHistory(
  sqlite: Database,
  sessionId: string,
): Promise<SessionHistoryPayload> {
  const lineage: SessionPayload[] = [];
  let current: SessionRow | null = getSessionRow(sqlite, sessionId);

  while (current) {
    lineage.unshift(mapSessionRow(current));
    current = current.parent_session_id
      ? getSessionRow(sqlite, current.parent_session_id)
      : null;
  }

  return {
    currentSessionId: sessionId,
    items: lineage,
  };
}
