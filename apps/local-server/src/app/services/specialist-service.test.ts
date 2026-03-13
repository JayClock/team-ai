import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createProject } from './project-service';
import { getSpecialistById, listSpecialists } from './specialist-service';

describe('specialist service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('loads built-in and workspace specialists with workspace precedence', async () => {
    const sqlite = await createTestDatabase();
    const repoPath = await mkdtemp(
      join(tmpdir(), 'team-ai-specialist-workspace-'),
    );
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });

    await mkdir(join(repoPath, 'resources', 'specialists'), {
      recursive: true,
    });
    await writeFile(
      join(repoPath, 'resources', 'specialists', 'crafter-implementor.md'),
      [
        '---',
        'id: crafter-implementor',
        'name: Workspace Crafter',
        'role: CRAFTER',
        'description: Workspace override',
        'modelTier: premium',
        '---',
        'Use the workspace-specific implementation prompt.',
      ].join('\n'),
      'utf8',
    );

    const project = await createProject(sqlite, {
      repoPath,
      title: 'Workspace',
    });

    const payload = await listSpecialists(sqlite, {
      projectId: project.id,
    });
    const crafter = payload.items.find(
      (specialist) => specialist.id === 'crafter-implementor',
    );

    expect(payload.items.map((specialist) => specialist.id)).toEqual(
      expect.arrayContaining([
        'routa-coordinator',
        'crafter-implementor',
        'gate-reviewer',
        'solo-developer',
      ]),
    );
    expect(crafter).toMatchObject({
      modelTier: 'premium',
      name: 'Workspace Crafter',
      source: {
        scope: 'workspace',
      },
    });
  });

  it('loads user specialists from the data directory', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-specialist-user-project',
      title: 'User Specialists',
    });
    const specialistsDir = join(
      process.env.TEAMAI_DATA_DIR as string,
      'specialists',
    );

    await mkdir(specialistsDir, {
      recursive: true,
    });
    await writeFile(
      join(specialistsDir, 'frontend-architect.json'),
      JSON.stringify({
        description: 'Custom frontend specialist',
        id: 'frontend-architect',
        modelTier: 'premium',
        name: 'Frontend Architect',
        role: 'CRAFTER',
        systemPrompt: 'Focus on frontend architecture.',
      }),
      'utf8',
    );

    const specialist = await getSpecialistById(
      sqlite,
      project.id,
      'frontend-architect',
    );

    expect(specialist).toMatchObject({
      id: 'frontend-architect',
      role: 'CRAFTER',
      source: {
        scope: 'user',
      },
    });
  });

  it('keeps the built-in coordinator prompt focused on planning and dispatch', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-specialist-routa-project',
      title: 'Routa Prompt',
    });

    const specialist = await getSpecialistById(
      sqlite,
      project.id,
      'routa-coordinator',
    );

    expect(specialist.systemPrompt).toContain(
      'Start by analyzing the user goal',
    );
    expect(specialist.systemPrompt).toContain(
      'Prioritize producing or refining a plan before execution',
    );
    expect(specialist.systemPrompt).toContain(
      'Do not take on large implementation, review, or verification work',
    );
    expect(specialist.systemPrompt).toContain('`acp_session_create` MCP tool');
    expect(specialist.systemPrompt).toContain('overall progress summary');
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(
      join(tmpdir(), 'team-ai-specialist-service-'),
    );
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
