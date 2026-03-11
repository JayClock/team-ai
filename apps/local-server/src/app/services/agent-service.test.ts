import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createProject } from './project-service';
import {
  createAgent,
  deleteAgent,
  getAgentById,
  listAgents,
  updateAgent,
} from './agent-service';

describe('agent service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('creates agents scoped to a project and lists only that project agents', async () => {
    const sqlite = await createTestDatabase();
    const projectA = await createProject(sqlite, {
      title: 'Project A',
      repoPath: '/Users/example/project-a',
    });
    const projectB = await createProject(sqlite, {
      title: 'Project B',
      repoPath: '/Users/example/project-b',
    });

    const agentA = await createAgent(sqlite, {
      projectId: projectA.id,
      name: 'Planner',
      role: 'planner',
      provider: 'codex',
      model: 'gpt-5',
      systemPrompt: 'Plan the work.',
    });
    await createAgent(sqlite, {
      projectId: projectB.id,
      name: 'Reviewer',
      role: 'reviewer',
      provider: 'codex',
      model: 'gpt-5-mini',
    });

    const list = await listAgents(sqlite, {
      projectId: projectA.id,
      page: 1,
      pageSize: 20,
    });

    expect(agentA.projectId).toBe(projectA.id);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      id: agentA.id,
      projectId: projectA.id,
      name: 'Planner',
    });
  });

  it('updates and soft deletes project agents', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Project Agent Mutations',
      repoPath: '/Users/example/project-agent-mutations',
    });
    const agent = await createAgent(sqlite, {
      projectId: project.id,
      name: 'Implementor',
      role: 'crafter',
      provider: 'codex',
      model: 'gpt-5',
    });

    const updated = await updateAgent(sqlite, project.id, agent.id, {
      name: 'Lead Implementor',
      systemPrompt: 'Ship the change.',
    });

    expect(updated).toMatchObject({
      id: agent.id,
      projectId: project.id,
      name: 'Lead Implementor',
      systemPrompt: 'Ship the change.',
    });

    await deleteAgent(sqlite, project.id, agent.id);

    await expect(getAgentById(sqlite, project.id, agent.id)).rejects.toMatchObject({
      status: 404,
      type: 'https://team-ai.dev/problems/agent-not-found',
    });
  });

  it('does not read agents across projects', async () => {
    const sqlite = await createTestDatabase();
    const projectA = await createProject(sqlite, {
      title: 'Project Lookup A',
      repoPath: '/Users/example/project-lookup-a',
    });
    const projectB = await createProject(sqlite, {
      title: 'Project Lookup B',
      repoPath: '/Users/example/project-lookup-b',
    });
    const agent = await createAgent(sqlite, {
      projectId: projectA.id,
      name: 'Scoped Agent',
      role: 'planner',
      provider: 'codex',
      model: 'gpt-5',
    });

    await expect(getAgentById(sqlite, projectB.id, agent.id)).rejects.toMatchObject({
      status: 404,
      type: 'https://team-ai.dev/problems/agent-not-found',
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-agent-service-'));
    const previousDataDir = process.env.TEAMAI_DATA_DIR;

    process.env.TEAMAI_DATA_DIR = dataDir;
    const sqlite = initializeDatabase();

    cleanupTasks.push(async () => {
      sqlite.close();
      if (previousDataDir === undefined) {
        delete process.env.TEAMAI_DATA_DIR;
      } else {
        process.env.TEAMAI_DATA_DIR = previousDataDir;
      }
      await rm(dataDir, { recursive: true, force: true });
    });

    return sqlite;
  }
});
