import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
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

const codebaseIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface CodebaseRow {
  branch: string | null;
  created_at: string;
  id: string;
  is_default: number;
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
    isDefault: row.is_default === 1,
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
  const row = sqlite
    .prepare(
      `
        SELECT id
        FROM projects
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(projectId) as { id: string } | undefined;

  if (!row) {
    throwProjectNotFound(projectId);
  }
}

function findCodebaseRowByProjectAndId(
  sqlite: Database,
  projectId: string,
  codebaseId: string,
) {
  return sqlite
    .prepare(
      `
        SELECT id, project_id, title, repo_path, source_type, source_url, branch
             , is_default, created_at, updated_at
        FROM project_codebases
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `,
    )
    .get(codebaseId, projectId) as CodebaseRow | undefined;
}

function findReusableCodebaseRow(
  sqlite: Database,
  repoPath: string | null,
  sourceUrl: string | null,
) {
  if (!repoPath && !sourceUrl) {
    return undefined;
  }

  return sqlite
    .prepare(
      `
        SELECT id, project_id, title, repo_path, source_type, source_url, branch
             , is_default, created_at, updated_at
        FROM project_codebases
        WHERE deleted_at IS NULL
          AND (
            (@repoPath IS NOT NULL AND repo_path = @repoPath)
            OR (@sourceUrl IS NOT NULL AND source_url = @sourceUrl)
          )
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 1
      `,
    )
    .get({
      repoPath,
      sourceUrl,
    }) as CodebaseRow | undefined;
}

export async function listProjectCodebases(
  sqlite: Database,
  projectId: string,
): Promise<CodebaseListPayload> {
  assertProjectExists(sqlite, projectId);

  const rows = sqlite
    .prepare(
      `
        SELECT id, project_id, title, repo_path, source_type, source_url, branch
             , is_default, created_at, updated_at
        FROM project_codebases
        WHERE project_id = ? AND deleted_at IS NULL
        ORDER BY is_default DESC, updated_at DESC, created_at DESC
      `,
    )
    .all(projectId) as CodebaseRow[];

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
  const repoPath = normalizedValue(project.repoPath);
  const sourceUrl = normalizedValue(project.sourceUrl);
  const now = new Date().toISOString();

  if (!repoPath && !sourceUrl) {
    sqlite
      .prepare(
        `
          UPDATE project_codebases
          SET
            deleted_at = @deletedAt,
            updated_at = @updatedAt,
            is_default = 0
          WHERE project_id = @projectId
            AND is_default = 1
            AND deleted_at IS NULL
        `,
      )
      .run({
        projectId: project.id,
        deletedAt: now,
        updatedAt: now,
      });

    return undefined;
  }

  const reusable =
    (sqlite
      .prepare(
        `
          SELECT id, project_id, title, repo_path, source_type, source_url, branch
               , is_default, created_at, updated_at
          FROM project_codebases
          WHERE project_id = @projectId
            AND deleted_at IS NULL
            AND (
              is_default = 1
              OR (@repoPath IS NOT NULL AND repo_path = @repoPath)
              OR (@sourceUrl IS NOT NULL AND source_url = @sourceUrl)
            )
          ORDER BY
            CASE
              WHEN (@repoPath IS NOT NULL AND repo_path = @repoPath)
                OR (@sourceUrl IS NOT NULL AND source_url = @sourceUrl)
              THEN 0
              ELSE 1
            END ASC,
            is_default DESC,
            updated_at DESC
          LIMIT 1
        `,
      )
      .get({
        projectId: project.id,
        repoPath,
        sourceUrl,
      }) as CodebaseRow | undefined) ?? undefined;

  const id = reusable?.id ?? createCodebaseId();
  const createdAt = reusable?.created_at ?? now;

  sqlite
    .prepare(
      `
        UPDATE project_codebases
        SET
          is_default = 0,
          updated_at = @updatedAt
        WHERE project_id = @projectId
          AND id != @id
          AND deleted_at IS NULL
          AND is_default = 1
      `,
    )
    .run({
      id,
      projectId: project.id,
      updatedAt: now,
    });

  sqlite
    .prepare(
      `
        INSERT INTO project_codebases (
          id,
          project_id,
          title,
          repo_path,
          source_type,
          source_url,
          branch,
          is_default,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          @id,
          @projectId,
          @title,
          @repoPath,
          @sourceType,
          @sourceUrl,
          NULL,
          1,
          @createdAt,
          @updatedAt,
          NULL
        )
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          repo_path = excluded.repo_path,
          source_type = excluded.source_type,
          source_url = excluded.source_url,
          branch = NULL,
          is_default = 1,
          updated_at = excluded.updated_at,
          deleted_at = NULL
      `,
    )
    .run({
      id,
      projectId: project.id,
      title: project.title.trim() || project.id,
      repoPath,
      sourceType: project.sourceType,
      sourceUrl,
      createdAt,
      updatedAt: now,
    });

  return getProjectCodebaseById(sqlite, project.id, id);
}

export async function deleteProjectCodebases(
  sqlite: Database,
  projectId: string,
): Promise<void> {
  const now = new Date().toISOString();

  sqlite
    .prepare(
      `
        UPDATE project_codebases
        SET
          deleted_at = @deletedAt,
          updated_at = @updatedAt
        WHERE project_id = @projectId
          AND deleted_at IS NULL
      `,
    )
    .run({
      projectId,
      deletedAt: now,
      updatedAt: now,
    });
}

export async function cloneProjectCodebase(
  sqlite: Database,
  projectId: string,
  input: CloneProjectCodebaseInput,
  dependencies?: ManagedRepositoryServiceDependencies,
): Promise<{ cloneStatus: 'cloned' | 'reused'; codebase: CodebasePayload }> {
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

  sqlite
    .prepare(
      `
        INSERT INTO project_codebases (
          id,
          project_id,
          title,
          repo_path,
          source_type,
          source_url,
          branch,
          is_default,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          @id,
          @projectId,
          @title,
          @repoPath,
          'github',
          @sourceUrl,
          NULL,
          COALESCE(@isDefault, 0),
          @createdAt,
          @updatedAt,
          NULL
        )
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          repo_path = excluded.repo_path,
          source_type = 'github',
          source_url = excluded.source_url,
          branch = NULL,
          updated_at = excluded.updated_at,
          deleted_at = NULL
      `,
    )
    .run({
      id,
      projectId,
      title: input.title?.trim() || result.repository.repo,
      repoPath,
      sourceUrl,
      isDefault: reusable?.is_default ?? 0,
      createdAt,
      updatedAt: now,
    });

  return {
    cloneStatus: result.cloneStatus,
    codebase: await getProjectCodebaseById(sqlite, projectId, id),
  };
}
