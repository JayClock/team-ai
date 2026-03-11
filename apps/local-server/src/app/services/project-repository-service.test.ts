import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { getProjectById } from './project-service';
import { cloneProjectRepository } from './project-repository-service';

describe('project repository service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('clones a github repository into the managed local directory and creates a project', async () => {
    const sqlite = await createTestDatabase();
    const cloneBaseDir = await mkdtemp(join(tmpdir(), 'team-ai-managed-repos-'));
    cleanupTasks.push(() => rm(cloneBaseDir, { recursive: true, force: true }));

    const runGit = vi.fn(async (args: string[]) => {
      if (args[0] === 'clone') {
        const targetDir = args.at(-1);
        if (targetDir) {
          await mkdir(targetDir, { recursive: true });
        }
      }
    });

    const result = await cloneProjectRepository(
      sqlite,
      {
        repositoryUrl: 'acme/agent-workbench',
      },
      {
        async ensureDirectory(path) {
          await mkdir(path, { recursive: true });
        },
        async pathExists() {
          return false;
        },
        resolveCloneBaseDir() {
          return cloneBaseDir;
        },
        runGit,
      },
    );

    expect(result.cloneStatus).toBe('cloned');
    expect(result.project.title).toBe('agent-workbench');
    expect(result.project.sourceType).toBe('github');
    expect(result.project.sourceUrl).toBe('https://github.com/acme/agent-workbench');
    expect(result.project.repoPath).toBe(join(cloneBaseDir, 'acme--agent-workbench'));
    expect(runGit).toHaveBeenCalledWith(
      ['clone', '--depth', '1', 'https://github.com/acme/agent-workbench.git', join(cloneBaseDir, 'acme--agent-workbench')],
    );
  });

  it('reuses an existing managed clone and project by repository source', async () => {
    const sqlite = await createTestDatabase();
    const cloneBaseDir = await mkdtemp(join(tmpdir(), 'team-ai-managed-repos-'));
    const repoPath = join(cloneBaseDir, 'acme--agent-workbench');

    cleanupTasks.push(() => rm(cloneBaseDir, { recursive: true, force: true }));
    await mkdir(repoPath, { recursive: true });

    const existing = await cloneProjectRepository(
      sqlite,
      {
        repositoryUrl: 'https://github.com/acme/agent-workbench',
      },
      {
        async ensureDirectory(path) {
          await mkdir(path, { recursive: true });
        },
        async pathExists(path) {
          return path === repoPath;
        },
        resolveCloneBaseDir() {
          return cloneBaseDir;
        },
        runGit: vi.fn(async () => undefined),
      },
    );

    const runGit = vi.fn(async () => undefined);

    const result = await cloneProjectRepository(
      sqlite,
      {
        repositoryUrl: 'acme/agent-workbench',
      },
      {
        async ensureDirectory(path) {
          await mkdir(path, { recursive: true });
        },
        async pathExists(path) {
          return path === repoPath;
        },
        resolveCloneBaseDir() {
          return cloneBaseDir;
        },
        runGit,
      },
    );

    expect(result.cloneStatus).toBe('reused');
    expect(result.project.id).toBe(existing.project.id);
    expect(runGit).toHaveBeenCalledWith(['pull', '--ff-only'], repoPath);

    const storedProject = await getProjectById(sqlite, existing.project.id);
    expect(storedProject.sourceUrl).toBe('https://github.com/acme/agent-workbench');
  });

  it('rejects invalid repository URLs before invoking git', async () => {
    const sqlite = await createTestDatabase();
    const runGit = vi.fn(async () => undefined);

    await expect(
      cloneProjectRepository(
        sqlite,
        {
          repositoryUrl: '/Users/example/team-ai',
        },
        {
          async ensureDirectory() {
            return undefined;
          },
          async pathExists() {
            return false;
          },
          resolveCloneBaseDir() {
            return '/tmp/team-ai-managed-repos';
          },
          runGit,
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
      type: 'https://team-ai.dev/problems/invalid-repository-url',
    });

    expect(runGit).not.toHaveBeenCalled();
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-project-repository-'));
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
