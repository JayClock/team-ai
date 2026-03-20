import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '@orchestration/runtime-acp';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { getDrizzleDb } from '../db/drizzle';
import { projectAgentsTable } from '../db/schema';
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
  parent_agent_id: string | null;
  provider: string;
  project_id: string;
  role: string;
  specialist_id: string | null;
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
    parentAgentId: row.parent_agent_id,
    projectId: row.project_id,
    specialistId: row.specialist_id,
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
  const db = getDrizzleDb(sqlite);
  const whereClause = and(
    eq(projectAgentsTable.projectId, query.projectId),
    isNull(projectAgentsTable.deletedAt),
  );
  const items = db
    .select({
      id: projectAgentsTable.id,
      project_id: projectAgentsTable.projectId,
      name: projectAgentsTable.name,
      role: projectAgentsTable.role,
      provider: projectAgentsTable.provider,
      model: projectAgentsTable.model,
      parent_agent_id: projectAgentsTable.parentAgentId,
      specialist_id: projectAgentsTable.specialistId,
      system_prompt: projectAgentsTable.systemPrompt,
      created_at: projectAgentsTable.createdAt,
      updated_at: projectAgentsTable.updatedAt,
    })
    .from(projectAgentsTable)
    .where(whereClause)
    .orderBy(desc(projectAgentsTable.updatedAt))
    .limit(query.pageSize)
    .offset(offset)
    .all() as AgentRow[];

  const total = db
    .select({ count: count() })
    .from(projectAgentsTable)
    .where(whereClause)
    .get() as { count: number };

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
  const db = getDrizzleDb(sqlite);
  const now = new Date().toISOString();
  const agent: AgentPayload = {
    id: createAgentId(),
    name: input.name,
    role: input.role,
    provider: input.provider,
    model: input.model,
    parentAgentId: input.parentAgentId ?? null,
    projectId: input.projectId,
    specialistId: input.specialistId ?? null,
    systemPrompt: input.systemPrompt ?? null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(projectAgentsTable)
    .values({
      id: agent.id,
      projectId: agent.projectId,
      name: agent.name,
      role: agent.role,
      provider: agent.provider,
      model: agent.model,
      parentAgentId: agent.parentAgentId,
      specialistId: agent.specialistId,
      systemPrompt: agent.systemPrompt,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      deletedAt: null,
    })
    .run();

  return agent;
}

export async function getAgentById(
  sqlite: Database,
  projectId: string,
  agentId: string,
): Promise<AgentPayload> {
  await getProjectById(sqlite, projectId);
  const row = getDrizzleDb(sqlite)
    .select({
      id: projectAgentsTable.id,
      project_id: projectAgentsTable.projectId,
      name: projectAgentsTable.name,
      role: projectAgentsTable.role,
      provider: projectAgentsTable.provider,
      model: projectAgentsTable.model,
      parent_agent_id: projectAgentsTable.parentAgentId,
      specialist_id: projectAgentsTable.specialistId,
      system_prompt: projectAgentsTable.systemPrompt,
      created_at: projectAgentsTable.createdAt,
      updated_at: projectAgentsTable.updatedAt,
    })
    .from(projectAgentsTable)
    .where(
      and(
        eq(projectAgentsTable.projectId, projectId),
        eq(projectAgentsTable.id, agentId),
        isNull(projectAgentsTable.deletedAt),
      ),
    )
    .get() as AgentRow | undefined;

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
  const db = getDrizzleDb(sqlite);
  const current = await getAgentById(sqlite, projectId, agentId);
  const next: AgentPayload = {
    ...current,
    name: input.name ?? current.name,
    role: input.role ?? current.role,
    provider: input.provider ?? current.provider,
    model: input.model ?? current.model,
    parentAgentId:
      input.parentAgentId === undefined
        ? current.parentAgentId
        : input.parentAgentId,
    specialistId:
      input.specialistId === undefined
        ? current.specialistId
        : input.specialistId,
    systemPrompt:
      input.systemPrompt === undefined ? current.systemPrompt : input.systemPrompt,
    updatedAt: new Date().toISOString(),
  };

  db.update(projectAgentsTable)
    .set({
      name: next.name,
      role: next.role,
      provider: next.provider,
      model: next.model,
      parentAgentId: next.parentAgentId,
      specialistId: next.specialistId,
      systemPrompt: next.systemPrompt,
      updatedAt: next.updatedAt,
    })
    .where(
      and(
        eq(projectAgentsTable.projectId, next.projectId),
        eq(projectAgentsTable.id, next.id),
        isNull(projectAgentsTable.deletedAt),
      ),
    )
    .run();

  return next;
}

export async function deleteAgent(
  sqlite: Database,
  projectId: string,
  agentId: string,
): Promise<void> {
  await getProjectById(sqlite, projectId);
  const now = new Date().toISOString();
  const result = getDrizzleDb(sqlite)
    .update(projectAgentsTable)
    .set({
      deletedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(projectAgentsTable.projectId, projectId),
        eq(projectAgentsTable.id, agentId),
        isNull(projectAgentsTable.deletedAt),
      ),
    )
    .run();

  if (result.changes === 0) {
    throwAgentNotFound(projectId, agentId);
  }
}
