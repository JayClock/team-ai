import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '@orchestration/runtime-acp';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { getDrizzleDb } from '../db/drizzle';
import { projectCodebasesTable, projectsTable } from '../db/schema';
import type {
  CloneProjectCodebaseInput,
  CodebaseListPayload,
  CodebasePayload,
} from '../schemas/codebase';
import type { ProjectPayload } from '../schemas/project';
import {
  ensureManagedRepository,
  type ManagedRepositoryServiceDependencies,
} from './managed-repository-service';
import {
  listProjectWorktrees,
  removeProjectWorktree,
} from './project-worktree-service';

const codebaseIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface CodebaseRow {
  branch: string | null;
  created_at: string;
  id: string;
  is_default: boolean;
  project_id: string;
  repo_path: string | null;
  source_type: 'github' | 'local' | null;
  source_url: string | null;
  title: string;
  updated_at: string;
}

function mapCodebaseRow(row: CodebaseRow): CodebasePayload {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    repoPath: row.repo_path,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    branch: row.branch,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createCodebaseId() {
  return `cdb_${codebaseIdGenerator()}`;
}

function throwProjectNotFound(projectId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/project-not-found',
    title: 'Project Not Found',
    status: 404,
    detail: `Project ${projectId} was not found`,
  });
}

function throwCodebaseNotFound(projectId: string, codebaseId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/codebase-not-found',
    title: 'Codebase Not Found',
    status: 404,
    detail: `Codebase ${codebaseId} was not found in project ${projectId}`,
  });
}

function throwCodebaseConflict(detail: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/codebase-conflict',
    title: 'Codebase Conflict',
    status: 409,
    detail,
  });
}

function normalizedValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function assertProjectExists(sqlite: Database, projectId: string) {
  const row = getDrizzleDb(sqlite)
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), isNull(projectsTable.deletedAt)))
    .get() as { id: string } | undefined;

  if (!row) {
    throwProjectNotFound(projectId);
  }
}

function findCodebaseRowByProjectAndId(
  sqlite: Database,
  projectId: string,
  codebaseId: string,
) {
  return getDrizzleDb(sqlite)
    .select({
      id: projectCodebasesTable.id,
      project_id: projectCodebasesTable.projectId,
      title: projectCodebasesTable.title,
      repo_path: projectCodebasesTable.repoPath,
      source_type: projectCodebasesTable.sourceType,
      source_url: projectCodebasesTable.sourceUrl,
      branch: projectCodebasesTable.branch,
      is_default: projectCodebasesTable.isDefault,
      created_at: projectCodebasesTable.createdAt,
      updated_at: projectCodebasesTable.updatedAt,
    })
    .from(projectCodebasesTable)
    .where(
      and(
        eq(projectCodebasesTable.id, codebaseId),
        eq(projectCodebasesTable.projectId, projectId),
        isNull(projectCodebasesTable.deletedAt),
      ),
    )
    .get() as CodebaseRow | undefined;
}

function findReusableCodebaseRow(
  sqlite: Database,
  repoPath: string | null,
  sourceUrl: string | null,
) {
  if (!repoPath && !sourceUrl) {
    return undefined;
  }

  return getDrizzleDb(sqlite)
    .select({
      id: projectCodebasesTable.id,
      project_id: projectCodebasesTable.projectId,
      title: projectCodebasesTable.title,
      repo_path: projectCodebasesTable.repoPath,
      source_type: projectCodebasesTable.sourceType,
      source_url: projectCodebasesTable.sourceUrl,
      branch: projectCodebasesTable.branch,
      is_default: projectCodebasesTable.isDefault,
      created_at: projectCodebasesTable.createdAt,
      updated_at: projectCodebasesTable.updatedAt,
    })
    .from(projectCodebasesTable)
    .where(
      and(
        isNull(projectCodebasesTable.deletedAt),
        or(
          repoPath ? eq(projectCodebasesTable.repoPath, repoPath) : undefined,
          sourceUrl ? eq(projectCodebasesTable.sourceUrl, sourceUrl) : undefined,
        )!,
      ),
    )
    .orderBy(
      desc(projectCodebasesTable.isDefault),
      desc(projectCodebasesTable.updatedAt),
    )
    .limit(1)
    .get() as CodebaseRow | undefined;
}

export async function listProjectCodebases(
  sqlite: Database,
  projectId: string,
): Promise<CodebaseListPayload> {
  assertProjectExists(sqlite, projectId);

  const rows = getDrizzleDb(sqlite)
    .select({
      id: projectCodebasesTable.id,
      project_id: projectCodebasesTable.projectId,
      title: projectCodebasesTable.title,
      repo_path: projectCodebasesTable.repoPath,
      source_type: projectCodebasesTable.sourceType,
      source_url: projectCodebasesTable.sourceUrl,
      branch: projectCodebasesTable.branch,
      is_default: projectCodebasesTable.isDefault,
      created_at: projectCodebasesTable.createdAt,
      updated_at: projectCodebasesTable.updatedAt,
    })
    .from(projectCodebasesTable)
    .where(
      and(
        eq(projectCodebasesTable.projectId, projectId),
        isNull(projectCodebasesTable.deletedAt),
      ),
    )
    .orderBy(
      desc(projectCodebasesTable.isDefault),
      desc(projectCodebasesTable.updatedAt),
      desc(projectCodebasesTable.createdAt),
    )
    .all() as CodebaseRow[];

  return {
    projectId,
    items: rows.map(mapCodebaseRow),
  };
}

export async function getProjectCodebaseById(
  sqlite: Database,
  projectId: string,
  codebaseId: string,
): Promise<CodebasePayload> {
  assertProjectExists(sqlite, projectId);

  const row = findCodebaseRowByProjectAndId(sqlite, projectId, codebaseId);
  if (!row) {
    throwCodebaseNotFound(projectId, codebaseId);
  }

  return mapCodebaseRow(row);
}

export async function syncProjectDefaultCodebase(
  sqlite: Database,
  project: ProjectPayload,
): Promise<CodebasePayload | undefined> {
  const db = getDrizzleDb(sqlite);
  const repoPath = normalizedValue(project.repoPath);
  const sourceUrl = normalizedValue(project.sourceUrl);
  const now = new Date().toISOString();

  if (!repoPath && !sourceUrl) {
    db.update(projectCodebasesTable)
      .set({
        deletedAt: now,
        updatedAt: now,
        isDefault: false,
      })
      .where(
        and(
          eq(projectCodebasesTable.projectId, project.id),
          eq(projectCodebasesTable.isDefault, true),
          isNull(projectCodebasesTable.deletedAt),
        ),
      )
      .run();

    return undefined;
  }

  const reusable = (
    db
      .select({
        id: projectCodebasesTable.id,
        project_id: projectCodebasesTable.projectId,
        title: projectCodebasesTable.title,
        repo_path: projectCodebasesTable.repoPath,
        source_type: projectCodebasesTable.sourceType,
        source_url: projectCodebasesTable.sourceUrl,
        branch: projectCodebasesTable.branch,
        is_default: projectCodebasesTable.isDefault,
        created_at: projectCodebasesTable.createdAt,
        updated_at: projectCodebasesTable.updatedAt,
      })
      .from(projectCodebasesTable)
      .where(
        and(
          eq(projectCodebasesTable.projectId, project.id),
          isNull(projectCodebasesTable.deletedAt),
          or(
            eq(projectCodebasesTable.isDefault, true),
            repoPath ? eq(projectCodebasesTable.repoPath, repoPath) : undefined,
            sourceUrl ? eq(projectCodebasesTable.sourceUrl, sourceUrl) : undefined,
          )!,
        ),
      )
      .all() as CodebaseRow[]
  ).sort((left, right) => {
    const leftExact =
      (repoPath !== null && left.repo_path === repoPath) ||
      (sourceUrl !== null && left.source_url === sourceUrl);
    const rightExact =
      (repoPath !== null && right.repo_path === repoPath) ||
      (sourceUrl !== null && right.source_url === sourceUrl);

    if (leftExact !== rightExact) {
      return leftExact ? -1 : 1;
    }

    if (left.is_default !== right.is_default) {
      return left.is_default ? -1 : 1;
    }

    return right.updated_at.localeCompare(left.updated_at);
  })[0];

  const id = reusable?.id ?? createCodebaseId();
  const createdAt = reusable?.created_at ?? now;

  db.update(projectCodebasesTable)
    .set({
      isDefault: false,
      updatedAt: now,
    })
    .where(
      and(
        eq(projectCodebasesTable.projectId, project.id),
        eq(projectCodebasesTable.isDefault, true),
        isNull(projectCodebasesTable.deletedAt),
      ),
    )
    .run();

  db.insert(projectCodebasesTable)
    .values({
      id,
      projectId: project.id,
      title: project.title.trim() || project.id,
      repoPath,
      sourceType: project.sourceType,
      sourceUrl,
      branch: null,
      isDefault: true,
      createdAt,
      updatedAt: now,
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: projectCodebasesTable.id,
      set: {
        title: project.title.trim() || project.id,
        repoPath,
        sourceType: project.sourceType,
        sourceUrl,
        branch: null,
        isDefault: true,
        updatedAt: now,
        deletedAt: null,
      },
    })
    .run();

  return getProjectCodebaseById(sqlite, project.id, id);
}

export async function deleteProjectCodebases(
  sqlite: Database,
  projectId: string,
  input: {
    deleteBranches?: boolean;
  } = {},
): Promise<void> {
  const codebases = await listProjectCodebases(sqlite, projectId);

  for (const codebase of codebases.items) {
    await deleteProjectCodebaseById(sqlite, projectId, codebase.id, input);
  }
}

export async function deleteProjectCodebaseById(
  sqlite: Database,
  projectId: string,
  codebaseId: string,
  input: {
    deleteBranches?: boolean;
  } = {},
): Promise<void> {
  await getProjectCodebaseById(sqlite, projectId, codebaseId);
  const now = new Date().toISOString();
  const worktrees = await listProjectWorktrees(sqlite, projectId, codebaseId);

  for (const worktree of worktrees.items) {
    await removeProjectWorktree(sqlite, projectId, worktree.id, {
      deleteBranch: input.deleteBranches,
    });
  }

  getDrizzleDb(sqlite)
    .update(projectCodebasesTable)
    .set({
      deletedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(projectCodebasesTable.id, codebaseId),
        eq(projectCodebasesTable.projectId, projectId),
        isNull(projectCodebasesTable.deletedAt),
      ),
    )
    .run();
}

export async function cloneProjectCodebase(
  sqlite: Database,
  projectId: string,
  input: CloneProjectCodebaseInput,
  dependencies?: ManagedRepositoryServiceDependencies,
): Promise<{ cloneStatus: 'cloned' | 'reused'; codebase: CodebasePayload }> {
  const db = getDrizzleDb(sqlite);
  assertProjectExists(sqlite, projectId);

  const result = await ensureManagedRepository(
    input.repositoryUrl,
    dependencies,
  );

  const repoPath = normalizedValue(result.repository.repoPath);
  const sourceUrl = normalizedValue(result.repository.canonicalSourceUrl);
  const reusable = findReusableCodebaseRow(sqlite, repoPath, sourceUrl);

  if (reusable && reusable.project_id !== projectId) {
    throwCodebaseConflict(
      `Repository ${sourceUrl ?? repoPath} is already assigned to project ${reusable.project_id}`,
    );
  }

  const now = new Date().toISOString();
  const id = reusable?.id ?? createCodebaseId();
  const createdAt = reusable?.created_at ?? now;

  db.insert(projectCodebasesTable)
    .values({
      id,
      projectId,
      title: input.title?.trim() || result.repository.repo,
      repoPath,
      sourceType: 'github',
      sourceUrl,
      branch: null,
      isDefault: reusable?.is_default ?? false,
      createdAt,
      updatedAt: now,
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: projectCodebasesTable.id,
      set: {
        title: input.title?.trim() || result.repository.repo,
        repoPath,
        sourceType: 'github',
        sourceUrl,
        branch: null,
        updatedAt: now,
        deletedAt: null,
      },
    })
    .run();

  return {
    cloneStatus: result.cloneStatus,
    codebase: await getProjectCodebaseById(sqlite, projectId, id),
  };
}
