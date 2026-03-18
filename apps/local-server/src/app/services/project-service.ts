import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '@orchestration/runtime-acp';
import type {
  CreateProjectInput,
  ProjectListPayload,
  ProjectPayload,
  UpdateProjectInput,
} from '../schemas/project';
import {
  deleteProjectCodebases,
  syncProjectDefaultCodebase,
} from './project-codebase-service';

const projectIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);
const defaultProjectTitle = 'Default Project';

interface ListProjectsQuery {
  page: number;
  pageSize: number;
  q?: string;
  repoPath?: string;
  sourceUrl?: string;
}

interface ProjectRow {
  created_at: string;
  description: string | null;
  id: string;
  source_type: 'github' | 'local' | null;
  source_url: string | null;
  title: string;
  updated_at: string;
  workspace_root: string | null;
}

function mapProjectRow(row: ProjectRow): ProjectPayload {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    repoPath: row.workspace_root,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
  };
}

function createProjectId() {
  return `proj_${projectIdGenerator()}`;
}

function throwProjectNotFound(projectId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/project-not-found',
    title: 'Project Not Found',
    status: 404,
    detail: `Project ${projectId} was not found`,
  });
}

function throwRepoPathConflict(repoPath: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/project-workspace-conflict',
    title: 'Project Workspace Conflict',
    status: 409,
    detail: `Repository path ${repoPath} is already assigned to another project`,
  });
}

function throwSourceUrlConflict(sourceUrl: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/project-source-conflict',
    title: 'Project Source Conflict',
    status: 409,
    detail: `Repository source ${sourceUrl} is already assigned to another project`,
  });
}

function isWorkspaceRootConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('idx_projects_workspace_root_active') ||
      error.message.includes(
        'UNIQUE constraint failed: projects.workspace_root',
      ))
  );
}

function isSourceUrlConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('idx_projects_source_url_active') ||
      error.message.includes('UNIQUE constraint failed: projects.source_url'))
  );
}

export async function listProjects(
  sqlite: Database,
  query: ListProjectsQuery,
): Promise<ProjectListPayload> {
  const { page, pageSize, q, repoPath, sourceUrl } = query;
  const offset = (page - 1) * pageSize;
  const filters = ['deleted_at IS NULL'];
  const parameters: Record<string, unknown> = {
    limit: pageSize,
    offset,
  };

  if (q) {
    filters.push('(title LIKE @search OR description LIKE @search)');
    parameters.search = `%${q}%`;
  }

  if (repoPath) {
    filters.push('workspace_root = @repoPath');
    parameters.repoPath = repoPath.trim();
  }

  if (sourceUrl) {
    filters.push('source_url = @sourceUrl');
    parameters.sourceUrl = sourceUrl.trim();
  }

  const whereClause = filters.join(' AND ');

  const items = sqlite
    .prepare(
      `
        SELECT id, title, description, created_at, updated_at
               , source_type, source_url, workspace_root
        FROM projects
        WHERE ${whereClause}
        ORDER BY updated_at DESC
        LIMIT @limit OFFSET @offset
      `,
    )
    .all(parameters) as ProjectRow[];

  const total = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM projects
        WHERE ${whereClause}
      `,
    )
    .get(parameters) as { count: number };

  return {
    items: items.map(mapProjectRow),
    page,
    pageSize,
    q,
    total: total.count,
    repoPath,
    sourceUrl,
  };
}

export async function findProjectByRepoPath(
  sqlite: Database,
  repoPath: string,
): Promise<ProjectPayload | undefined> {
  const normalizedRepoPath = repoPath.trim();

  if (normalizedRepoPath.length === 0) {
    return undefined;
  }

  const row = sqlite
    .prepare(
      `
        SELECT id, title, description, created_at, updated_at, workspace_root
             , source_type, source_url
        FROM projects
        WHERE workspace_root = ? AND deleted_at IS NULL
      `,
    )
    .get(normalizedRepoPath) as ProjectRow | undefined;

  return row ? mapProjectRow(row) : undefined;
}

export async function findProjectBySourceUrl(
  sqlite: Database,
  sourceUrl: string,
): Promise<ProjectPayload | undefined> {
  const normalizedSourceUrl = sourceUrl.trim();

  if (normalizedSourceUrl.length === 0) {
    return undefined;
  }

  const row = sqlite
    .prepare(
      `
        SELECT id, title, description, created_at, updated_at
             , source_type, source_url, workspace_root
        FROM projects
        WHERE source_url = ? AND deleted_at IS NULL
      `,
    )
    .get(normalizedSourceUrl) as ProjectRow | undefined;

  return row ? mapProjectRow(row) : undefined;
}

export async function createProject(
  sqlite: Database,
  input: CreateProjectInput,
): Promise<ProjectPayload> {
  const now = new Date().toISOString();
  const repoPath = input.repoPath?.trim() || null;
  const sourceUrl = input.sourceUrl?.trim() || null;
  const project: ProjectPayload = {
    id: createProjectId(),
    title: input.title,
    description: input.description ?? null,
    createdAt: now,
    updatedAt: now,
    repoPath,
    sourceType: input.sourceType ?? null,
    sourceUrl,
  };

  try {
    sqlite
      .prepare(
        `
          INSERT INTO projects (
            id,
            title,
            description,
            source_type,
            source_url,
            workspace_root,
            created_at,
            updated_at,
            deleted_at
          )
          VALUES (
            @id,
            @title,
            @description,
            @sourceType,
            @sourceUrl,
            @repoPath,
            @createdAt,
            @updatedAt,
            NULL
          )
        `,
      )
      .run(project);
  } catch (error) {
    if (repoPath && isWorkspaceRootConstraintError(error)) {
      throwRepoPathConflict(repoPath);
    }

    if (sourceUrl && isSourceUrlConstraintError(error)) {
      throwSourceUrlConflict(sourceUrl);
    }

    throw error;
  }

  await syncProjectDefaultCodebase(sqlite, project);

  return project;
}

export async function ensureDefaultProject(
  sqlite: Database,
): Promise<ProjectPayload> {
  const row = sqlite
    .prepare(
      `
        SELECT id, title, description, created_at, updated_at
             , source_type, source_url, workspace_root
        FROM projects
        WHERE deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    )
    .get() as ProjectRow | undefined;

  if (row) {
    return mapProjectRow(row);
  }

  return createProject(sqlite, {
    title: defaultProjectTitle,
  });
}

export async function getProjectById(
  sqlite: Database,
  projectId: string,
): Promise<ProjectPayload> {
  const row = sqlite
    .prepare(
      `
        SELECT id, title, description, created_at, updated_at
             , source_type, source_url, workspace_root
        FROM projects
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(projectId) as ProjectRow | undefined;

  if (!row) {
    throwProjectNotFound(projectId);
  }

  return mapProjectRow(row);
}

export async function updateProject(
  sqlite: Database,
  projectId: string,
  input: UpdateProjectInput,
): Promise<ProjectPayload> {
  const current = await getProjectById(sqlite, projectId);
  const next: ProjectPayload = {
    ...current,
    title: input.title ?? current.title,
    description:
      input.description === undefined ? current.description : input.description,
    repoPath:
      input.repoPath === undefined
        ? current.repoPath
        : input.repoPath?.trim() || null,
    updatedAt: new Date().toISOString(),
    sourceType:
      input.sourceType === undefined ? current.sourceType : input.sourceType,
    sourceUrl:
      input.sourceUrl === undefined
        ? current.sourceUrl
        : input.sourceUrl?.trim() || null,
  };

  try {
    sqlite
      .prepare(
        `
          UPDATE projects
          SET
            title = @title,
            description = @description,
            source_type = @sourceType,
            source_url = @sourceUrl,
            workspace_root = @repoPath,
            updated_at = @updatedAt
          WHERE id = @id AND deleted_at IS NULL
      `,
      )
      .run(next);
  } catch (error) {
    if (next.repoPath && isWorkspaceRootConstraintError(error)) {
      throwRepoPathConflict(next.repoPath);
    }

    if (next.sourceUrl && isSourceUrlConstraintError(error)) {
      throwSourceUrlConflict(next.sourceUrl);
    }

    throw error;
  }

  await syncProjectDefaultCodebase(sqlite, next);

  return next;
}

export async function deleteProject(
  sqlite: Database,
  projectId: string,
): Promise<void> {
  await deleteProjectCodebases(sqlite, projectId);

  const result = sqlite
    .prepare(
      `
        UPDATE projects
        SET
          deleted_at = @deletedAt,
          updated_at = @updatedAt
        WHERE id = @id AND deleted_at IS NULL
      `,
    )
    .run({
      id: projectId,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

  if (result.changes === 0) {
    throwProjectNotFound(projectId);
  }
}
