import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
import type {
  AgentListPayload,
  AgentPayload,
  CreateAgentInput,
  UpdateAgentInput,
} from '../schemas/agent';

const agentIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface ListAgentsQuery {
  page: number;
  pageSize: number;
}

interface AgentRow {
  created_at: string;
  id: string;
  model: string;
  name: string;
  provider: string;
  role: string;
  system_prompt: string | null;
  updated_at: string;
}

function mapAgentRow(row: AgentRow): AgentPayload {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    provider: row.provider,
    model: row.model,
    systemPrompt: row.system_prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createAgentId() {
  return `agent_${agentIdGenerator()}`;
}

function throwAgentNotFound(agentId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/agent-not-found',
    title: 'Agent Not Found',
    status: 404,
    detail: `Agent ${agentId} was not found`,
  });
}

export async function listAgents(
  sqlite: Database,
  query: ListAgentsQuery,
): Promise<AgentListPayload> {
  const offset = (query.page - 1) * query.pageSize;
  const items = sqlite
    .prepare(
      `
        SELECT
          id,
          name,
          role,
          provider,
          model,
          system_prompt,
          created_at,
          updated_at
        FROM agents
        WHERE deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT @limit OFFSET @offset
      `,
    )
    .all({
      limit: query.pageSize,
      offset,
    }) as AgentRow[];

  const total = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM agents
        WHERE deleted_at IS NULL
      `,
    )
    .get() as { count: number };

  return {
    items: items.map(mapAgentRow),
    page: query.page,
    pageSize: query.pageSize,
    total: total.count,
  };
}

export async function createAgent(
  sqlite: Database,
  input: CreateAgentInput,
): Promise<AgentPayload> {
  const now = new Date().toISOString();
  const agent: AgentPayload = {
    id: createAgentId(),
    name: input.name,
    role: input.role,
    provider: input.provider,
    model: input.model,
    systemPrompt: input.systemPrompt ?? null,
    createdAt: now,
    updatedAt: now,
  };

  sqlite
    .prepare(
      `
        INSERT INTO agents (
          id,
          name,
          role,
          provider,
          model,
          system_prompt,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          @id,
          @name,
          @role,
          @provider,
          @model,
          @systemPrompt,
          @createdAt,
          @updatedAt,
          NULL
        )
      `,
    )
    .run(agent);

  return agent;
}

export async function getAgentById(
  sqlite: Database,
  agentId: string,
): Promise<AgentPayload> {
  const row = sqlite
    .prepare(
      `
        SELECT
          id,
          name,
          role,
          provider,
          model,
          system_prompt,
          created_at,
          updated_at
        FROM agents
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(agentId) as AgentRow | undefined;

  if (!row) {
    throwAgentNotFound(agentId);
  }

  return mapAgentRow(row);
}

export async function updateAgent(
  sqlite: Database,
  agentId: string,
  input: UpdateAgentInput,
): Promise<AgentPayload> {
  const current = await getAgentById(sqlite, agentId);
  const next: AgentPayload = {
    ...current,
    name: input.name ?? current.name,
    role: input.role ?? current.role,
    provider: input.provider ?? current.provider,
    model: input.model ?? current.model,
    systemPrompt:
      input.systemPrompt === undefined ? current.systemPrompt : input.systemPrompt,
    updatedAt: new Date().toISOString(),
  };

  sqlite
    .prepare(
      `
        UPDATE agents
        SET
          name = @name,
          role = @role,
          provider = @provider,
          model = @model,
          system_prompt = @systemPrompt,
          updated_at = @updatedAt
        WHERE id = @id AND deleted_at IS NULL
      `,
    )
    .run(next);

  return next;
}

export async function deleteAgent(
  sqlite: Database,
  agentId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const result = sqlite
    .prepare(
      `
        UPDATE agents
        SET
          deleted_at = @deletedAt,
          updated_at = @updatedAt
        WHERE id = @id AND deleted_at IS NULL
      `,
    )
    .run({
      id: agentId,
      deletedAt: now,
      updatedAt: now,
    });

  if (result.changes === 0) {
    throwAgentNotFound(agentId);
  }
}
