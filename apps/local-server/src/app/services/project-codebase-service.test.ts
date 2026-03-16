import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createProject, updateProject } from './project-service';
import {
  cloneProjectCodebase,
  deleteProjectCodebaseById,
  getProjectCodebaseById,
  listProjectCodebases,
} from './project-codebase-service';
import {
  createProjectWorktree,
  listProjectWorktrees,
} from './project-worktree-service';

const execFileAsync = promisify(execFile);

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

  it('removes attached worktrees before deleting a codebase', async () => {
    const sqlite = await createTestDatabase();
    const repoPath = await createGitRepository();
    const project = await createProject(sqlite, {
      title: 'Delete Codebase',
      repoPath,
    });
    const [codebase] = (await listProjectCodebases(sqlite, project.id)).items;
    const worktree = await createProjectWorktree(sqlite, project.id, codebase.id, {
      label: 'Delete Codebase Worktree',
    });

    await deleteProjectCodebaseById(sqlite, project.id, codebase.id);

    await expect(
      getProjectCodebaseById(sqlite, project.id, codebase.id),
    ).rejects.toMatchObject({
      status: 404,
      type: 'https://team-ai.dev/problems/codebase-not-found',
    });
    expect(
      await listProjectWorktrees(sqlite, project.id, codebase.id).catch(() => ({
        items: [],
      })),
    ).toMatchObject({
      items: [],
    });
    expect(worktree.id).toMatch(/^wt_/);
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

  async function createGitRepository() {
    const repoPath = await mkdtemp(join(tmpdir(), 'team-ai-project-codebase-repo-'));
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });

    await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: repoPath });
    await execFileAsync('git', ['config', 'user.name', 'Team AI Test'], {
      cwd: repoPath,
    });
    await execFileAsync('git', ['config', 'user.email', 'team-ai@example.test'], {
      cwd: repoPath,
    });
    await execFileAsync('git', ['commit', '--allow-empty', '-m', 'initial'], {
      cwd: repoPath,
    });
    return repoPath;
  }
});
