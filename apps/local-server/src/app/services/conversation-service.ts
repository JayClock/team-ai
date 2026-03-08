import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
import type {
  ConversationListPayload,
  ConversationPayload,
  CreateConversationInput,
  UpdateConversationInput,
} from '../schemas/conversation';
import { getProjectById } from './project-service';

const conversationIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface ListConversationsQuery {
  page: number;
  pageSize: number;
}

interface ConversationRow {
  created_at: string;
  id: string;
  project_id: string;
  title: string;
  updated_at: string;
}

function mapConversationRow(row: ConversationRow): ConversationPayload {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createConversationId() {
  return `conv_${conversationIdGenerator()}`;
}

function throwConversationNotFound(conversationId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/conversation-not-found',
    title: 'Conversation Not Found',
    status: 404,
    detail: `Conversation ${conversationId} was not found`,
  });
}

export async function listConversationsByProject(
  sqlite: Database,
  projectId: string,
  query: ListConversationsQuery,
): Promise<ConversationListPayload> {
  await getProjectById(sqlite, projectId);

  const { page, pageSize } = query;
  const offset = (page - 1) * pageSize;

  const items = sqlite
    .prepare(
      `
        SELECT id, project_id, title, created_at, updated_at
        FROM conversations
        WHERE project_id = @projectId AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT @limit OFFSET @offset
      `,
    )
    .all({
      projectId,
      limit: pageSize,
      offset,
    }) as ConversationRow[];

  const total = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM conversations
        WHERE project_id = @projectId AND deleted_at IS NULL
      `,
    )
    .get({ projectId }) as { count: number };

  return {
    items: items.map(mapConversationRow),
    page,
    pageSize,
    projectId,
    total: total.count,
  };
}

export async function createConversation(
  sqlite: Database,
  projectId: string,
  input: CreateConversationInput,
): Promise<ConversationPayload> {
  await getProjectById(sqlite, projectId);

  const now = new Date().toISOString();
  const conversation: ConversationPayload = {
    id: createConversationId(),
    projectId,
    title: input.title,
    createdAt: now,
    updatedAt: now,
  };

  sqlite
    .prepare(
      `
        INSERT INTO conversations (
          id,
          project_id,
          title,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          @id,
          @projectId,
          @title,
          @createdAt,
          @updatedAt,
          NULL
        )
      `,
    )
    .run(conversation);

  return conversation;
}

export async function getConversationById(
  sqlite: Database,
  conversationId: string,
): Promise<ConversationPayload> {
  const row = sqlite
    .prepare(
      `
        SELECT id, project_id, title, created_at, updated_at
        FROM conversations
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(conversationId) as ConversationRow | undefined;

  if (!row) {
    throwConversationNotFound(conversationId);
  }

  return mapConversationRow(row);
}

export async function updateConversation(
  sqlite: Database,
  conversationId: string,
  input: UpdateConversationInput,
): Promise<ConversationPayload> {
  const current = await getConversationById(sqlite, conversationId);
  const next: ConversationPayload = {
    ...current,
    title: input.title,
    updatedAt: new Date().toISOString(),
  };

  sqlite
    .prepare(
      `
        UPDATE conversations
        SET
          title = @title,
          updated_at = @updatedAt
        WHERE id = @id AND deleted_at IS NULL
      `,
    )
    .run(next);

  return next;
}

export async function deleteConversation(
  sqlite: Database,
  conversationId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const result = sqlite
    .prepare(
      `
        UPDATE conversations
        SET
          deleted_at = @deletedAt,
          updated_at = @updatedAt
        WHERE id = @id AND deleted_at IS NULL
      `,
    )
    .run({
      id: conversationId,
      deletedAt: now,
      updatedAt: now,
    });

  if (result.changes === 0) {
    throwConversationNotFound(conversationId);
  }
}
