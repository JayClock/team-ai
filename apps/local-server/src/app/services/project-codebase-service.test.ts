import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createProject, updateProject } from './project-service';
import {
  cloneProjectCodebase,
  listProjectCodebases,
} from './project-codebase-service';

describe('project codebase service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('creates a default codebase from the project workspace root', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Workspace Root',
      repoPath: '/Users/example/workspace-root',
      sourceType: 'github',
      sourceUrl: 'https://github.com/example/workspace-root',
    });

    const codebases = await listProjectCodebases(sqlite, project.id);

    expect(codebases.items).toHaveLength(1);
    expect(codebases.items[0]).toMatchObject({
      isDefault: true,
      repoPath: '/Users/example/workspace-root',
      sourceType: 'github',
      sourceUrl: 'https://github.com/example/workspace-root',
      title: 'Workspace Root',
    });
  });

  it('keeps the default codebase in sync when the project workspace changes', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Workspace Root',
      repoPath: '/Users/example/workspace-root',
    });

    await updateProject(sqlite, project.id, {
      repoPath: '/Users/example/workspace-renamed',
      sourceType: 'github',
      sourceUrl: 'https://github.com/example/workspace-renamed',
      title: 'Workspace Renamed',
    });

    const codebases = await listProjectCodebases(sqlite, project.id);

    expect(codebases.items).toHaveLength(1);
    expect(codebases.items[0]).toMatchObject({
      isDefault: true,
      repoPath: '/Users/example/workspace-renamed',
      sourceType: 'github',
      sourceUrl: 'https://github.com/example/workspace-renamed',
      title: 'Workspace Renamed',
    });
  });

  it('adds a secondary codebase by cloning into the managed repository directory', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Workspace Root',
      repoPath: '/Users/example/workspace-root',
    });

    const result = await cloneProjectCodebase(
      sqlite,
      project.id,
      {
        repositoryUrl: 'acme/agent-workbench',
      },
      {
        ensureDirectory: async () => undefined,
        pathExists: async () => false,
        resolveCloneBaseDir: () => '/tmp/team-ai-managed-repos',
        runGit: async () => undefined,
      },
    );

    expect(result.cloneStatus).toBe('cloned');

    const codebases = await listProjectCodebases(sqlite, project.id);

    expect(codebases.items).toHaveLength(2);
    expect(codebases.items[0]).toMatchObject({
      isDefault: true,
      repoPath: '/Users/example/workspace-root',
    });
    expect(codebases.items[1]).toMatchObject({
      isDefault: false,
      repoPath: '/tmp/team-ai-managed-repos/acme--agent-workbench',
      sourceType: 'github',
      sourceUrl: 'https://github.com/acme/agent-workbench',
      title: 'agent-workbench',
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-project-codebase-'));
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

