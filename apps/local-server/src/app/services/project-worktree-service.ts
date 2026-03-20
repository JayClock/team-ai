import { execFile } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import type { Database } from 'better-sqlite3';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { ProblemError } from '@orchestration/runtime-acp';
import { getDrizzleDb } from '../db/drizzle';
import { projectWorktreesTable } from '../db/schema';
import { resolveDataDirectory } from '../db/sqlite';
import type {
  WorktreeListPayload,
  WorktreePayload,
  WorktreeStatus,
} from '../schemas/worktree';
import { getProjectCodebaseById } from './project-codebase-service';

const execFileAsync = promisify(execFile);

export interface CreateProjectWorktreeInput {
  baseBranch?: string;
  branch?: string;
  label?: string;
  worktreeRoot?: string;
}

export interface RemoveProjectWorktreeInput {
  deleteBranch?: boolean;
}

export interface ValidateProjectWorktreeResult {
  error?: string;
  healthy: boolean;
}

interface WorktreeRow {
  base_branch: string;
  branch: string;
  codebase_id: string;
  created_at: string;
  error_message: string | null;
  id: string;
  label: string | null;
  project_id: string;
  session_id: string | null;
  status: WorktreeStatus;
  updated_at: string;
  worktree_path: string;
}

interface GitWorktreeServiceDependencies {
  ensureDirectory(path: string): Promise<void>;
  pathExists(path: string): Promise<boolean>;
  resolveDefaultWorktreeRoot(projectId: string): string;
  runGit(
    args: string[],
    cwd: string,
  ): Promise<{ stderr: string; stdout: string }>;
}

const defaultDependencies: GitWorktreeServiceDependencies = {
  async ensureDirectory(path) {
    await mkdir(path, { recursive: true });
  },
  async pathExists(path) {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  },
  resolveDefaultWorktreeRoot(projectId) {
    return join(resolveDataDirectory(), 'worktrees', projectId);
  },
  async runGit(args, cwd) {
    return execFileAsync('git', args, {
      cwd,
      timeout: 180_000,
    });
  },
};

const repoLocks = new Map<string, Promise<void>>();

function createWorktreeId() {
  return `wt_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function buildTaskWorktreeSlug(taskId: string, title: string) {
  const shortId = taskId.slice(0, 8);
  const normalizedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return normalizedTitle ? `${shortId}-${normalizedTitle}` : shortId;
}

export function buildTaskWorktreeBranch(taskId: string, title: string) {
  return `issue/${buildTaskWorktreeSlug(taskId, title)}`;
}

function mapWorktreeRow(row: WorktreeRow): WorktreePayload {
  return {
    id: row.id,
    projectId: row.project_id,
    codebaseId: row.codebase_id,
    worktreePath: row.worktree_path,
    branch: row.branch,
    baseBranch: row.base_branch,
    status: row.status,
    sessionId: row.session_id,
    label: row.label,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function branchToSafeDirName(branch: string): string {
  return branch
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function throwWorktreeNotFound(projectId: string, worktreeId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/worktree-not-found',
    title: 'Worktree Not Found',
    status: 404,
    detail: `Worktree ${worktreeId} was not found in project ${projectId}`,
  });
}

function throwWorktreeConflict(detail: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/worktree-conflict',
    title: 'Worktree Conflict',
    status: 409,
    detail,
  });
}

function throwCodebaseWorkspaceMissing(projectId: string, codebaseId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/codebase-workspace-missing',
    title: 'Codebase Workspace Missing',
    status: 409,
    detail: `Codebase ${codebaseId} in project ${projectId} requires an absolute repoPath`,
  });
}

async function withRepoLock<T>(repoPath: string, task: () => Promise<T>): Promise<T> {
  const current = repoLocks.get(repoPath) ?? Promise.resolve();

  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });

  repoLocks.set(repoPath, next);
  await current;

  try {
    return await task();
  } finally {
    release();
    if (repoLocks.get(repoPath) === next) {
      repoLocks.delete(repoPath);
    }
  }
}

async function branchExists(
  dependencies: GitWorktreeServiceDependencies,
  repoPath: string,
  branch: string,
) {
  const result = await dependencies.runGit(['branch', '--list', branch], repoPath);
  return result.stdout.trim().length > 0;
}

async function worktreePrune(
  dependencies: GitWorktreeServiceDependencies,
  repoPath: string,
) {
  await dependencies.runGit(['worktree', 'prune'], repoPath);
}

async function worktreeAdd(
  dependencies: GitWorktreeServiceDependencies,
  repoPath: string,
  worktreePath: string,
  branch: string,
  baseBranch: string,
  createBranch: boolean,
) {
  const args = createBranch
    ? ['worktree', 'add', '-b', branch, worktreePath, baseBranch]
    : ['worktree', 'add', worktreePath, branch];
  await dependencies.runGit(args, repoPath);
}

async function worktreeRemove(
  dependencies: GitWorktreeServiceDependencies,
  repoPath: string,
  worktreePath: string,
  force = true,
) {
  const args = ['worktree', 'remove', ...(force ? ['--force'] : []), worktreePath];
  await dependencies.runGit(args, repoPath);
}

function getWorktreeRow(
  sqlite: Database,
  projectId: string,
  worktreeId: string,
): WorktreeRow {
  const row = getDrizzleDb(sqlite)
    .select({
      base_branch: projectWorktreesTable.baseBranch,
      branch: projectWorktreesTable.branch,
      codebase_id: projectWorktreesTable.codebaseId,
      created_at: projectWorktreesTable.createdAt,
      error_message: projectWorktreesTable.errorMessage,
      id: projectWorktreesTable.id,
      label: projectWorktreesTable.label,
      project_id: projectWorktreesTable.projectId,
      session_id: projectWorktreesTable.sessionId,
      status: projectWorktreesTable.status,
      updated_at: projectWorktreesTable.updatedAt,
      worktree_path: projectWorktreesTable.worktreePath,
    })
    .from(projectWorktreesTable)
    .where(
      and(
        eq(projectWorktreesTable.id, worktreeId),
        eq(projectWorktreesTable.projectId, projectId),
        isNull(projectWorktreesTable.deletedAt),
      ),
    )
    .get() as WorktreeRow | undefined;

  if (!row) {
    throwWorktreeNotFound(projectId, worktreeId);
  }

  return row;
}

function updateWorktreeStatus(
  sqlite: Database,
  worktreeId: string,
  status: WorktreeStatus,
  errorMessage: string | null = null,
) {
  getDrizzleDb(sqlite)
    .update(projectWorktreesTable)
    .set({
      status,
      errorMessage,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(projectWorktreesTable.id, worktreeId),
        isNull(projectWorktreesTable.deletedAt),
      ),
    )
    .run();
}

function softDeleteWorktree(sqlite: Database, worktreeId: string) {
  const now = new Date().toISOString();
  getDrizzleDb(sqlite)
    .update(projectWorktreesTable)
    .set({
      deletedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(projectWorktreesTable.id, worktreeId),
        isNull(projectWorktreesTable.deletedAt),
      ),
    )
    .run();
}

export async function listProjectWorktrees(
  sqlite: Database,
  projectId: string,
  codebaseId: string,
): Promise<WorktreeListPayload> {
  await getProjectCodebaseById(sqlite, projectId, codebaseId);

  const rows = getDrizzleDb(sqlite)
    .select({
      base_branch: projectWorktreesTable.baseBranch,
      branch: projectWorktreesTable.branch,
      codebase_id: projectWorktreesTable.codebaseId,
      created_at: projectWorktreesTable.createdAt,
      error_message: projectWorktreesTable.errorMessage,
      id: projectWorktreesTable.id,
      label: projectWorktreesTable.label,
      project_id: projectWorktreesTable.projectId,
      session_id: projectWorktreesTable.sessionId,
      status: projectWorktreesTable.status,
      updated_at: projectWorktreesTable.updatedAt,
      worktree_path: projectWorktreesTable.worktreePath,
    })
    .from(projectWorktreesTable)
    .where(
      and(
        eq(projectWorktreesTable.projectId, projectId),
        eq(projectWorktreesTable.codebaseId, codebaseId),
        isNull(projectWorktreesTable.deletedAt),
      ),
    )
    .orderBy(desc(projectWorktreesTable.createdAt))
    .all() as WorktreeRow[];

  return {
    projectId,
    codebaseId,
    items: rows.map(mapWorktreeRow),
  };
}

export async function getProjectWorktreeById(
  sqlite: Database,
  projectId: string,
  worktreeId: string,
): Promise<WorktreePayload> {
  return mapWorktreeRow(getWorktreeRow(sqlite, projectId, worktreeId));
}

export async function createProjectWorktree(
  sqlite: Database,
  projectId: string,
  codebaseId: string,
  input: CreateProjectWorktreeInput = {},
  dependencies: GitWorktreeServiceDependencies = defaultDependencies,
): Promise<WorktreePayload> {
  const codebase = await getProjectCodebaseById(sqlite, projectId, codebaseId);
  const repoPath = codebase.repoPath?.trim();

  if (!repoPath || !isAbsolute(repoPath)) {
    throwCodebaseWorkspaceMissing(projectId, codebaseId);
  }

  const baseBranch = input.baseBranch?.trim() || codebase.branch || 'main';
  const label = input.label?.trim() || null;
  const suffix = branchToSafeDirName(label ?? createWorktreeId()) || createWorktreeId();
  const branch = input.branch?.trim() || `wt/${suffix}`;

  return withRepoLock(repoPath, async () => {
    const existing = getDrizzleDb(sqlite)
      .select({
        id: projectWorktreesTable.id,
      })
      .from(projectWorktreesTable)
      .where(
        and(
          eq(projectWorktreesTable.codebaseId, codebaseId),
          eq(projectWorktreesTable.branch, branch),
          isNull(projectWorktreesTable.deletedAt),
        ),
      )
      .get() as { id: string } | undefined;

    if (existing) {
      throwWorktreeConflict(`Branch ${branch} is already allocated to worktree ${existing.id}`);
    }

    const worktreeRoot =
      input.worktreeRoot?.trim() ||
      dependencies.resolveDefaultWorktreeRoot(projectId);
    const codebaseLabel = branchToSafeDirName(codebase.title || codebase.id) || codebase.id;
    const worktreeDir = branchToSafeDirName(label ?? branch) || suffix;
    const worktreePath = join(worktreeRoot, codebaseLabel, worktreeDir);
    const id = createWorktreeId();
    const now = new Date().toISOString();

    getDrizzleDb(sqlite)
      .insert(projectWorktreesTable)
      .values({
        id,
        projectId,
        codebaseId,
        worktreePath,
        branch,
        baseBranch,
        status: 'creating' satisfies WorktreeStatus,
        sessionId: null,
        label,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();

    try {
      await dependencies.ensureDirectory(worktreeRoot);
      await worktreePrune(dependencies, repoPath).catch(() => undefined);

      const shouldCreateBranch = !(await branchExists(dependencies, repoPath, branch));
      await worktreeAdd(
        dependencies,
        repoPath,
        worktreePath,
        branch,
        baseBranch,
        shouldCreateBranch,
      );

      updateWorktreeStatus(sqlite, id, 'active');
      return getProjectWorktreeById(sqlite, projectId, id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateWorktreeStatus(sqlite, id, 'error', message);
      throw new ProblemError({
        type: 'https://team-ai.dev/problems/worktree-create-failed',
        title: 'Worktree Create Failed',
        status: 500,
        detail: message,
      });
    }
  });
}

export async function removeProjectWorktree(
  sqlite: Database,
  projectId: string,
  worktreeId: string,
  input: RemoveProjectWorktreeInput = {},
  dependencies: GitWorktreeServiceDependencies = defaultDependencies,
) {
  const worktree = getWorktreeRow(sqlite, projectId, worktreeId);
  const codebase = await getProjectCodebaseById(sqlite, projectId, worktree.codebase_id);
  const repoPath = codebase.repoPath?.trim();

  if (!repoPath || !isAbsolute(repoPath)) {
    softDeleteWorktree(sqlite, worktreeId);
    return;
  }

  await withRepoLock(repoPath, async () => {
    updateWorktreeStatus(sqlite, worktreeId, 'removing');

    try {
      await worktreeRemove(dependencies, repoPath, worktree.worktree_path, true);
    } catch {
      // Best-effort cleanup; the directory may already be missing.
    }

    await worktreePrune(dependencies, repoPath).catch(() => undefined);

    if (input.deleteBranch) {
      await dependencies.runGit(['branch', '-D', worktree.branch], repoPath).catch(() => undefined);
    }

    softDeleteWorktree(sqlite, worktreeId);
  });
}

export async function validateProjectWorktree(
  sqlite: Database,
  projectId: string,
  worktreeId: string,
  dependencies: GitWorktreeServiceDependencies = defaultDependencies,
): Promise<ValidateProjectWorktreeResult> {
  const worktree = getWorktreeRow(sqlite, projectId, worktreeId);

  if (!(await dependencies.pathExists(worktree.worktree_path))) {
    updateWorktreeStatus(sqlite, worktreeId, 'error', 'Worktree directory missing');
    return {
      healthy: false,
      error: 'Worktree directory missing',
    };
  }

  if (!(await dependencies.pathExists(join(worktree.worktree_path, '.git')))) {
    updateWorktreeStatus(sqlite, worktreeId, 'error', 'Not a valid worktree (.git file missing)');
    return {
      healthy: false,
      error: 'Not a valid worktree (.git file missing)',
    };
  }

  if (worktree.status === 'error') {
    updateWorktreeStatus(sqlite, worktreeId, 'active');
  }

  return {
    healthy: true,
  };
}

export const __worktreeTestUtils = {
  branchToSafeDirName,
  buildTaskWorktreeBranch,
  buildTaskWorktreeSlug,
  withRepoLock,
};
