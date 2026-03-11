import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import {
  createProject,
  findProjectBySourceUrl,
  findProjectByRepoPath,
  getProjectById,
  listProjects,
  updateProject,
} from './project-service';

describe('project service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('persists repoPath when creating and loading a project', async () => {
    const sqlite = await createTestDatabase();

    const project = await createProject(sqlite, {
      title: 'Team AI',
      description: 'Local repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/team-ai/team-ai',
      repoPath: '/Users/example/team-ai',
    });

    const reloadedProject = await getProjectById(sqlite, project.id);

    expect(reloadedProject.repoPath).toBe('/Users/example/team-ai');
    expect(reloadedProject.sourceType).toBe('github');
    expect(reloadedProject.sourceUrl).toBe('https://github.com/team-ai/team-ai');
  });

  it('filters projects by repoPath', async () => {
    const sqlite = await createTestDatabase();

    await createProject(sqlite, {
      title: 'Team AI',
      repoPath: '/Users/example/team-ai',
    });
    await createProject(sqlite, {
      title: 'Other',
      repoPath: '/Users/example/other',
    });

    const filteredProjects = await listProjects(sqlite, {
      page: 1,
      pageSize: 20,
      repoPath: '/Users/example/team-ai',
    });

    expect(filteredProjects.items).toHaveLength(1);
    expect(filteredProjects.items[0]?.title).toBe('Team AI');
  });

  it('finds a project by repoPath for reuse', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Team AI',
      repoPath: '/Users/example/team-ai',
    });

    const resolvedProject = await findProjectByRepoPath(
      sqlite,
      '/Users/example/team-ai',
    );

    expect(resolvedProject?.id).toBe(project.id);
  });

  it('finds a project by sourceUrl for reuse', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Team AI',
      sourceType: 'github',
      sourceUrl: 'https://github.com/team-ai/team-ai',
      repoPath: '/Users/example/team-ai',
    });

    const resolvedProject = await findProjectBySourceUrl(
      sqlite,
      'https://github.com/team-ai/team-ai',
    );

    expect(resolvedProject?.id).toBe(project.id);
  });

  it('updates repoPath', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Team AI',
    });

    const updatedProject = await updateProject(sqlite, project.id, {
      repoPath: '/Users/example/team-ai',
    });

    expect(updatedProject.repoPath).toBe('/Users/example/team-ai');
  });

  it('updates repository source metadata', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Team AI',
    });

    const updatedProject = await updateProject(sqlite, project.id, {
      sourceType: 'github',
      sourceUrl: 'https://github.com/team-ai/team-ai',
    });

    expect(updatedProject.sourceType).toBe('github');
    expect(updatedProject.sourceUrl).toBe('https://github.com/team-ai/team-ai');
  });

  it('rejects duplicate repoPath values', async () => {
    const sqlite = await createTestDatabase();

    await createProject(sqlite, {
      title: 'Team AI',
      repoPath: '/Users/example/team-ai',
    });

    await expect(
      createProject(sqlite, {
        title: 'Team AI Copy',
        repoPath: '/Users/example/team-ai',
      }),
    ).rejects.toMatchObject({
      status: 409,
      type: 'https://team-ai.dev/problems/project-workspace-conflict',
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-project-service-'));
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
