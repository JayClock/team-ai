import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
import type {
  CreateProjectInput,
  ProjectListPayload,
  ProjectPayload,
  UpdateProjectInput,
} from '../schemas/project';

const projectIdGenerator = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

interface ListProjectsQuery {
  page: number;
  pageSize: number;
  q?: string;
}

interface ProjectRow {
  created_at: string;
  description: string | null;
  id: string;
  title: string;
  updated_at: string;
}

function mapProjectRow(row: ProjectRow): ProjectPayload {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

export async function listProjects(
  sqlite: Database,
  query: ListProjectsQuery,
): Promise<ProjectListPayload> {
  const { page, pageSize, q } = query;
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

  const whereClause = filters.join(' AND ');

  const items = sqlite
    .prepare(
      `
        SELECT id, title, description, created_at, updated_at
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
  };
}

export async function createProject(
  sqlite: Database,
  input: CreateProjectInput,
): Promise<ProjectPayload> {
  const now = new Date().toISOString();
  const project: ProjectPayload = {
    id: createProjectId(),
    title: input.title,
    description: input.description ?? null,
    createdAt: now,
    updatedAt: now,
  };

  sqlite
    .prepare(
      `
        INSERT INTO projects (
          id,
          title,
          description,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          @id,
          @title,
          @description,
          @createdAt,
          @updatedAt,
          NULL
        )
      `,
    )
    .run(project);

  return project;
}

export async function getProjectById(
  sqlite: Database,
  projectId: string,
): Promise<ProjectPayload> {
  const row = sqlite
    .prepare(
      `
        SELECT id, title, description, created_at, updated_at
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
    updatedAt: new Date().toISOString(),
  };

  sqlite
    .prepare(
      `
        UPDATE projects
        SET
          title = @title,
          description = @description,
          updated_at = @updatedAt
        WHERE id = @id AND deleted_at IS NULL
      `,
    )
    .run(next);

  return next;
}

export async function deleteProject(
  sqlite: Database,
  projectId: string,
): Promise<void> {
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
