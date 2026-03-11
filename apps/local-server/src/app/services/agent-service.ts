import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
import type {
  AgentListPayload,
  AgentPayload,
  CreateAgentInput,
  UpdateAgentInput,
} from '../schemas/agent';
import { getProjectById } from './project-service';

const agentIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface ListAgentsQuery {
  page: number;
  pageSize: number;
  projectId: string;
}

interface AgentRow {
  created_at: string;
  id: string;
  model: string;
  name: string;
  provider: string;
  project_id: string;
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
    projectId: row.project_id,
    systemPrompt: row.system_prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createAgentId() {
  return `agent_${agentIdGenerator()}`;
}

function throwAgentNotFound(projectId: string, agentId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/agent-not-found',
    title: 'Agent Not Found',
    status: 404,
    detail: `Agent ${agentId} was not found in project ${projectId}`,
  });
}

export async function listAgents(
  sqlite: Database,
  query: ListAgentsQuery,
): Promise<AgentListPayload> {
  await getProjectById(sqlite, query.projectId);
  const offset = (query.page - 1) * query.pageSize;
  const items = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          name,
          role,
          provider,
          model,
          system_prompt,
          created_at,
          updated_at
        FROM project_agents
        WHERE project_id = @projectId AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT @limit OFFSET @offset
      `,
    )
    .all({
      projectId: query.projectId,
      limit: query.pageSize,
      offset,
    }) as AgentRow[];

  const total = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM project_agents
        WHERE project_id = @projectId AND deleted_at IS NULL
      `,
    )
    .get({
      projectId: query.projectId,
    }) as { count: number };

  return {
    items: items.map(mapAgentRow),
    page: query.page,
    pageSize: query.pageSize,
    projectId: query.projectId,
    total: total.count,
  };
}

export async function createAgent(
  sqlite: Database,
  input: CreateAgentInput,
): Promise<AgentPayload> {
  await getProjectById(sqlite, input.projectId);
  const now = new Date().toISOString();
  const agent: AgentPayload = {
    id: createAgentId(),
    name: input.name,
    role: input.role,
    provider: input.provider,
    model: input.model,
    projectId: input.projectId,
    systemPrompt: input.systemPrompt ?? null,
    createdAt: now,
    updatedAt: now,
  };

  sqlite
    .prepare(
      `
        INSERT INTO project_agents (
          id,
          project_id,
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
          @projectId,
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
  projectId: string,
  agentId: string,
): Promise<AgentPayload> {
  await getProjectById(sqlite, projectId);
  const row = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          name,
          role,
          provider,
          model,
          system_prompt,
          created_at,
          updated_at
        FROM project_agents
        WHERE project_id = ? AND id = ? AND deleted_at IS NULL
      `,
    )
    .get(projectId, agentId) as AgentRow | undefined;

  if (!row) {
    throwAgentNotFound(projectId, agentId);
  }

  return mapAgentRow(row);
}

export async function updateAgent(
  sqlite: Database,
  projectId: string,
  agentId: string,
  input: UpdateAgentInput,
): Promise<AgentPayload> {
  const current = await getAgentById(sqlite, projectId, agentId);
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
        UPDATE project_agents
        SET
          name = @name,
          role = @role,
          provider = @provider,
          model = @model,
          system_prompt = @systemPrompt,
          updated_at = @updatedAt
        WHERE project_id = @projectId AND id = @id AND deleted_at IS NULL
      `,
    )
    .run(next);

  return next;
}

export async function deleteAgent(
  sqlite: Database,
  projectId: string,
  agentId: string,
): Promise<void> {
  await getProjectById(sqlite, projectId);
  const now = new Date().toISOString();
  const result = sqlite
    .prepare(
      `
        UPDATE project_agents
        SET
          deleted_at = @deletedAt,
          updated_at = @updatedAt
        WHERE project_id = @projectId AND id = @id AND deleted_at IS NULL
      `,
    )
    .run({
      projectId,
      id: agentId,
      deletedAt: now,
      updatedAt: now,
    });

  if (result.changes === 0) {
    throwAgentNotFound(projectId, agentId);
  }
}
