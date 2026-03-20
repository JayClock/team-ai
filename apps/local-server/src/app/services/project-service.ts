import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '@orchestration/runtime-acp';
import { and, count, desc, eq, isNull, like, or } from 'drizzle-orm';
import { getDrizzleDb } from '../db/drizzle';
import { projectsTable } from '../db/schema';
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
  const db = getDrizzleDb(sqlite);
  const filters = [isNull(projectsTable.deletedAt)];

  if (q) {
    const search = `%${q}%`;
    filters.push(
      or(like(projectsTable.title, search), like(projectsTable.description, search))!,
    );
  }

  if (repoPath) {
    filters.push(eq(projectsTable.workspaceRoot, repoPath.trim()));
  }

  if (sourceUrl) {
    filters.push(eq(projectsTable.sourceUrl, sourceUrl.trim()));
  }

  const whereClause = and(...filters);

  const items = db
    .select({
      id: projectsTable.id,
      title: projectsTable.title,
      description: projectsTable.description,
      created_at: projectsTable.createdAt,
      updated_at: projectsTable.updatedAt,
      source_type: projectsTable.sourceType,
      source_url: projectsTable.sourceUrl,
      workspace_root: projectsTable.workspaceRoot,
    })
    .from(projectsTable)
    .where(whereClause)
    .orderBy(desc(projectsTable.updatedAt))
    .limit(pageSize)
    .offset(offset)
    .all() as ProjectRow[];

  const total = db
    .select({ count: count() })
    .from(projectsTable)
    .where(whereClause)
    .get() as { count: number };

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

  const row = getDrizzleDb(sqlite)
    .select({
      id: projectsTable.id,
      title: projectsTable.title,
      description: projectsTable.description,
      created_at: projectsTable.createdAt,
      updated_at: projectsTable.updatedAt,
      workspace_root: projectsTable.workspaceRoot,
      source_type: projectsTable.sourceType,
      source_url: projectsTable.sourceUrl,
    })
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.workspaceRoot, normalizedRepoPath),
        isNull(projectsTable.deletedAt),
      ),
    )
    .get() as ProjectRow | undefined;

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

  const row = getDrizzleDb(sqlite)
    .select({
      id: projectsTable.id,
      title: projectsTable.title,
      description: projectsTable.description,
      created_at: projectsTable.createdAt,
      updated_at: projectsTable.updatedAt,
      source_type: projectsTable.sourceType,
      source_url: projectsTable.sourceUrl,
      workspace_root: projectsTable.workspaceRoot,
    })
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.sourceUrl, normalizedSourceUrl),
        isNull(projectsTable.deletedAt),
      ),
    )
    .get() as ProjectRow | undefined;

  return row ? mapProjectRow(row) : undefined;
}

export async function createProject(
  sqlite: Database,
  input: CreateProjectInput,
): Promise<ProjectPayload> {
  const db = getDrizzleDb(sqlite);
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
    db.insert(projectsTable)
      .values({
        id: project.id,
        title: project.title,
        description: project.description,
        sourceType: project.sourceType,
        sourceUrl: project.sourceUrl,
        workspaceRoot: project.repoPath,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        deletedAt: null,
      })
      .run();
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
  const row = getDrizzleDb(sqlite)
    .select({
      id: projectsTable.id,
      title: projectsTable.title,
      description: projectsTable.description,
      created_at: projectsTable.createdAt,
      updated_at: projectsTable.updatedAt,
      source_type: projectsTable.sourceType,
      source_url: projectsTable.sourceUrl,
      workspace_root: projectsTable.workspaceRoot,
    })
    .from(projectsTable)
    .where(isNull(projectsTable.deletedAt))
    .orderBy(desc(projectsTable.updatedAt))
    .limit(1)
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
  const row = getDrizzleDb(sqlite)
    .select({
      id: projectsTable.id,
      title: projectsTable.title,
      description: projectsTable.description,
      created_at: projectsTable.createdAt,
      updated_at: projectsTable.updatedAt,
      source_type: projectsTable.sourceType,
      source_url: projectsTable.sourceUrl,
      workspace_root: projectsTable.workspaceRoot,
    })
    .from(projectsTable)
    .where(
      and(eq(projectsTable.id, projectId), isNull(projectsTable.deletedAt)),
    )
    .get() as ProjectRow | undefined;

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
  const db = getDrizzleDb(sqlite);
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
    db.update(projectsTable)
      .set({
        title: next.title,
        description: next.description,
        sourceType: next.sourceType,
        sourceUrl: next.sourceUrl,
        workspaceRoot: next.repoPath,
        updatedAt: next.updatedAt,
      })
      .where(
        and(eq(projectsTable.id, next.id), isNull(projectsTable.deletedAt)),
      )
      .run();
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
  const db = getDrizzleDb(sqlite);
  await deleteProjectCodebases(sqlite, projectId);
  const timestamp = new Date().toISOString();

  const result = db
    .update(projectsTable)
    .set({
      deletedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(
      and(eq(projectsTable.id, projectId), isNull(projectsTable.deletedAt)),
    )
    .run();

  if (result.changes === 0) {
    throwProjectNotFound(projectId);
  }
}
