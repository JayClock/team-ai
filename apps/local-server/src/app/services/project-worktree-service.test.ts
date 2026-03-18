import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { ProblemError } from '@orchestration/runtime-acp';
import { initializeDatabase } from '../db/sqlite';
import { createProject } from './project-service';
import { listProjectCodebases } from './project-codebase-service';
import {
  __worktreeTestUtils,
  createProjectWorktree,
  getProjectWorktreeById,
  listProjectWorktrees,
  removeProjectWorktree,
  validateProjectWorktree,
} from './project-worktree-service';

const execFileAsync = promisify(execFile);

describe('project worktree service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      await cleanupTasks.pop()?.();
    }
  });

  it('creates, lists, loads, validates, and removes worktrees', async () => {
    const { sqlite } = await createTestDatabase();
    const repoPath = await createGitRepository();
    const project = await createProject(sqlite, {
      title: 'Worktree Project',
      repoPath,
    });
    const codebase = (await listProjectCodebases(sqlite, project.id)).items[0];

    const created = await createProjectWorktree(sqlite, project.id, codebase.id, {
      label: 'Feature Branch',
    });

    expect(created).toMatchObject({
      projectId: project.id,
      codebaseId: codebase.id,
      status: 'active',
      branch: 'wt/Feature-Branch',
    });
    expect(created.worktreePath).toContain('/Worktree-Project/Feature-Branch');

    const loaded = await getProjectWorktreeById(sqlite, project.id, created.id);
    expect(loaded.id).toBe(created.id);

    const listed = await listProjectWorktrees(sqlite, project.id, codebase.id);
    expect(listed.items.map((item) => item.id)).toEqual([created.id]);

    expect(await validateProjectWorktree(sqlite, project.id, created.id)).toEqual({
      healthy: true,
    });

    await removeProjectWorktree(sqlite, project.id, created.id);

    const afterDelete = await listProjectWorktrees(sqlite, project.id, codebase.id);
    expect(afterDelete.items).toHaveLength(0);
  });

  it('rejects duplicate branches for the same codebase', async () => {
    const { sqlite } = await createTestDatabase();
    const repoPath = await createGitRepository();
    const project = await createProject(sqlite, {
      title: 'Worktree Conflict Project',
      repoPath,
    });
    const codebase = (await listProjectCodebases(sqlite, project.id)).items[0];

    await createProjectWorktree(sqlite, project.id, codebase.id, {
      branch: 'wt/conflict',
      label: 'Conflict',
    });

    await expect(
      createProjectWorktree(sqlite, project.id, codebase.id, {
        branch: 'wt/conflict',
      }),
    ).rejects.toMatchObject<Partial<ProblemError>>({
      status: 409,
      title: 'Worktree Conflict',
    });
  });

  it('builds task worktree branches with routa-style issue prefixes', () => {
    expect(
      __worktreeTestUtils.buildTaskWorktreeBranch(
        'task_1234567890',
        'Fix flaky worktree cleanup',
      ),
    ).toBe('issue/task_123-fix-flaky-worktree-cleanup');
  });

  it('serializes worktree operations per repository', async () => {
    const steps: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = __worktreeTestUtils.withRepoLock('/tmp/repo-lock-test', async () => {
      steps.push('first:start');
      await firstGate;
      steps.push('first:end');
    });
    const second = __worktreeTestUtils.withRepoLock('/tmp/repo-lock-test', async () => {
      steps.push('second:start');
      steps.push('second:end');
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(steps).toEqual(['first:start']);

    releaseFirst();
    await Promise.all([first, second]);

    expect(steps).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ]);
  });

  async function createTestDatabase(): Promise<{ sqlite: Database }> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-worktree-service-'));
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

    return { sqlite };
  }

  async function createGitRepository() {
    const repoPath = await mkdtemp(join(tmpdir(), 'team-ai-worktree-repo-'));
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });

    await mkdir(repoPath, { recursive: true });
    await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: repoPath });
    await execFileAsync('git', ['config', 'user.name', 'Team AI Test'], {
      cwd: repoPath,
    });
    await execFileAsync('git', ['config', 'user.email', 'team-ai@example.test'], {
      cwd: repoPath,
    });
    await writeFile(join(repoPath, 'README.md'), '# test\n');
    await execFileAsync('git', ['add', 'README.md'], { cwd: repoPath });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: repoPath });
    return repoPath;
  }
});
