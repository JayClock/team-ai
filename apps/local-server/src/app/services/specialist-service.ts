import type { Database } from 'better-sqlite3';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { resolveDataDirectory } from '../db/sqlite';
import { ProblemError } from '@orchestration/runtime-acp';
import { isRoleValue, type RoleValue } from '../schemas/role';
import type {
  SpecialistListPayload,
  SpecialistPayload,
} from '../schemas/specialist';
import { getProjectById } from './project-service';

type SpecialistSourceScope = SpecialistPayload['source']['scope'];

interface SpecialistFilePayload {
  defaultAdapter?: string | null;
  defaultModelTier?: string | null;
  description?: string | null;
  id?: string;
  modelTier?: string | null;
  name?: string;
  role?: string;
  roleReminder?: string | null;
  systemPrompt?: string;
}

export interface UpsertSpecialistInput {
  defaultAdapter?: string | null;
  definitionContent?: string;
  description?: string | null;
  format?: 'json' | 'markdown';
  id: string;
  modelTier?: string | null;
  name?: string;
  projectId: string;
  role?: string;
  roleReminder?: string | null;
  systemPrompt?: string;
}

const specialistAliasById: Record<string, string> = {
  crafter: 'crafter-implementor',
  developer: 'solo-developer',
  gate: 'gate-reviewer',
  routa: 'routa-coordinator',
};

function throwSpecialistNotFound(specialistId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/specialist-not-found',
    title: 'Specialist Not Found',
    status: 404,
    detail: `Specialist ${specialistId} was not found`,
  });
}

export function throwInvalidRole(role: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/invalid-role',
    title: 'Invalid Role',
    status: 400,
    detail: `Role ${role} is not supported`,
  });
}

function throwSpecialistDefinitionInvalid(detail: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/specialist-definition-invalid',
    title: 'Specialist Definition Invalid',
    status: 400,
    detail,
  });
}

function throwSpecialistDeleteConflict(
  specialistId: string,
  boardName: string,
  columnName: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/specialist-delete-conflict',
    title: 'Specialist Delete Conflict',
    status: 409,
    detail:
      `Specialist ${specialistId} is still referenced by board ${boardName} column ${columnName}`,
  });
}

function throwSpecialistSourceImmutable(
  specialistId: string,
  scope: SpecialistSourceScope,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/specialist-source-immutable',
    title: 'Specialist Source Immutable',
    status: 409,
    detail:
      `Specialist ${specialistId} is sourced from ${scope}; create a user override instead of deleting it directly`,
  });
}

export function throwSpecialistRoleMismatch(
  specialistId: string,
  role: string,
  expectedRole: RoleValue,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/specialist-role-mismatch',
    title: 'Specialist Role Mismatch',
    status: 409,
    detail: `Specialist ${specialistId} uses role ${expectedRole}, not ${role}`,
  });
}

function getBuiltInSpecialistsDirectory() {
  return join(__dirname, '..', '..', 'assets', 'specialists');
}

function getUserSpecialistsDirectory() {
  return join(resolveDataDirectory(), 'specialists');
}

function getUserLibrariesDirectory() {
  return join(resolveDataDirectory(), 'libraries');
}

function getWorkspaceLibrariesDirectory(projectRepoPath: string) {
  return join(projectRepoPath, 'resources', 'libraries');
}

async function canReadDirectory(directoryPath: string) {
  try {
    await access(directoryPath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function parseFrontmatter(content: string) {
  if (!content.startsWith('---\n')) {
    return {
      body: content.trim(),
      metadata: {} as SpecialistFilePayload,
    };
  }

  const endIndex = content.indexOf('\n---\n', 4);

  if (endIndex === -1) {
    return {
      body: content.trim(),
      metadata: {} as SpecialistFilePayload,
    };
  }

  const frontmatter = content.slice(4, endIndex);
  const metadata: SpecialistFilePayload = {};

  for (const line of frontmatter.split('\n')) {
    const separatorIndex = line.indexOf(':');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (key === 'id') {
      metadata.id = value;
    } else if (key === 'name') {
      metadata.name = value;
    } else if (key === 'role') {
      metadata.role = value;
    } else if (key === 'description') {
      metadata.description = value || null;
    } else if (
      key === 'defaultModelTier' ||
      key === 'default_model_tier' ||
      key === 'modelTier' ||
      key === 'model_tier'
    ) {
      metadata.modelTier = value || null;
    } else if (key === 'roleReminder' || key === 'role_reminder') {
      metadata.roleReminder = value || null;
    } else if (key === 'defaultAdapter' || key === 'default_adapter') {
      metadata.defaultAdapter = value || null;
    }
  }

  return {
    body: content.slice(endIndex + 5).trim(),
    metadata,
  };
}

function parseSpecialistContent(
  content: string,
  format: 'json' | 'markdown',
  fallbackId: string,
) {
  if (format === 'json') {
    return normalizeSpecialist(
      join(getUserSpecialistsDirectory(), `${fallbackId}.json`),
      'user',
      JSON.parse(content) as SpecialistFilePayload,
      fallbackId,
    );
  }

  const parsed = parseFrontmatter(content);
  return normalizeSpecialist(
    join(getUserSpecialistsDirectory(), `${fallbackId}.md`),
    'user',
    {
      ...parsed.metadata,
      systemPrompt: parsed.body,
    },
    fallbackId,
  );
}

function normalizeSpecialist(
  filePath: string,
  scope: SpecialistSourceScope,
  payload: SpecialistFilePayload,
  fallbackId: string,
) {
  if (!payload.id || !payload.name || !payload.role || !payload.systemPrompt) {
    return null;
  }

  if (!isRoleValue(payload.role)) {
    return null;
  }

  return {
    defaultAdapter: payload.defaultAdapter ?? null,
    description: payload.description ?? null,
    id: payload.id || fallbackId,
    modelTier: payload.modelTier ?? payload.defaultModelTier ?? null,
    name: payload.name,
    role: payload.role,
    roleReminder: payload.roleReminder ?? null,
    source: {
      path: filePath,
      scope,
    },
    systemPrompt: payload.systemPrompt,
  } satisfies SpecialistPayload;
}

export function renderSpecialistSystemPrompt(
  specialist: Pick<SpecialistPayload, 'roleReminder' | 'systemPrompt'>,
) {
  const roleReminder = specialist.roleReminder?.trim();

  return roleReminder
    ? `${specialist.systemPrompt.trim()}\n\n---\nReminder: ${roleReminder}`
    : specialist.systemPrompt;
}

async function readSpecialistFile(
  filePath: string,
  scope: SpecialistSourceScope,
) {
  const extension = extname(filePath).toLowerCase();
  const fallbackId = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? filePath;
  const content = await readFile(filePath, 'utf8');

  if (extension === '.json') {
    return normalizeSpecialist(
      filePath,
      scope,
      JSON.parse(content) as SpecialistFilePayload,
      fallbackId,
    );
  }

  if (extension === '.md') {
    const parsed = parseFrontmatter(content);
    return normalizeSpecialist(
      filePath,
      scope,
      {
        ...parsed.metadata,
        systemPrompt: parsed.body,
      },
      fallbackId,
    );
  }

  return null;
}

async function loadDirectorySpecialists(
  directoryPath: string,
  scope: SpecialistSourceScope,
  libraryId: string | null = null,
) {
  if (!(await canReadDirectory(directoryPath))) {
    return [] as SpecialistPayload[];
  }

  const entries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  const specialists: SpecialistPayload[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const extension = extname(entry.name).toLowerCase();

    if (extension !== '.json' && extension !== '.md') {
      continue;
    }

    const specialist = await readSpecialistFile(join(directoryPath, entry.name), scope);

    if (specialist) {
      specialists.push({
        ...specialist,
        source: {
          ...specialist.source,
          libraryId,
        },
      });
    }
  }

  return specialists;
}

function serializeSpecialistFile(
  input: Omit<SpecialistPayload, 'source'>,
  format: 'json' | 'markdown',
) {
  if (format === 'markdown') {
    return [
      '---',
      `id: ${input.id}`,
      `name: ${input.name}`,
      `role: ${input.role}`,
      `description: ${input.description ?? ''}`,
      `modelTier: ${input.modelTier ?? ''}`,
      `roleReminder: ${input.roleReminder ?? ''}`,
      `defaultAdapter: ${input.defaultAdapter ?? ''}`,
      '---',
      '',
      input.systemPrompt,
      '',
    ].join('\n');
  }

  return JSON.stringify(
    {
      defaultAdapter: input.defaultAdapter,
      description: input.description,
      id: input.id,
      modelTier: input.modelTier,
      name: input.name,
      role: input.role,
      roleReminder: input.roleReminder,
      systemPrompt: input.systemPrompt,
    },
    null,
    2,
  );
}

async function loadLibrarySpecialists(librariesDirectory: string) {
  if (!(await canReadDirectory(librariesDirectory))) {
    return [] as SpecialistPayload[];
  }

  const entries = await readdir(librariesDirectory, {
    withFileTypes: true,
  });
  const specialists: SpecialistPayload[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    specialists.push(
      ...(await loadDirectorySpecialists(
        join(librariesDirectory, entry.name, 'specialists'),
        'library',
        entry.name,
      )),
    );
  }

  return specialists;
}

function mergeSpecialists(groups: SpecialistPayload[][]) {
  const merged = new Map<string, SpecialistPayload>();

  for (const group of groups) {
    for (const specialist of group) {
      merged.set(specialist.id, specialist);
    }
  }

  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

const defaultSpecialistIdByRole: Record<RoleValue, string> = {
  ROUTA: 'routa-coordinator',
  CRAFTER: 'crafter-implementor',
  GATE: 'gate-reviewer',
  DEVELOPER: 'solo-developer',
};

async function listResolvedSpecialists(projectRepoPath?: string | null) {
  const builtIn = await loadDirectorySpecialists(
    getBuiltInSpecialistsDirectory(),
    'builtin',
  );
  const sharedLibraries = await loadLibrarySpecialists(getUserLibrariesDirectory());
  const workspaceLibraries = projectRepoPath
    ? await loadLibrarySpecialists(getWorkspaceLibrariesDirectory(projectRepoPath))
    : [];
  const workspace = projectRepoPath
    ? await loadDirectorySpecialists(
        join(projectRepoPath, 'resources', 'specialists'),
        'workspace',
      )
    : [];
  const user = await loadDirectorySpecialists(getUserSpecialistsDirectory(), 'user');

  return mergeSpecialists([
    builtIn,
    sharedLibraries,
    workspaceLibraries,
    workspace,
    user,
  ]);
}

export async function listSpecialists(
  sqlite: Database,
  options: {
    projectId?: string;
  } = {},
): Promise<SpecialistListPayload> {
  const project = options.projectId
    ? await getProjectById(sqlite, options.projectId)
    : null;

  return {
    items: await listResolvedSpecialists(project?.repoPath),
    projectId: options.projectId,
  };
}

export async function getSpecialistById(
  sqlite: Database,
  projectId: string,
  specialistId: string,
) {
  const payload = await listSpecialists(sqlite, {
    projectId,
  });
  const specialist =
    payload.items.find((item) => item.id === specialistId) ??
    payload.items.find(
      (item) => item.id === specialistAliasById[specialistId]!,
    );

  if (!specialist) {
    throwSpecialistNotFound(specialistId);
  }

  return specialist;
}

function resolveSpecialistFileFormat(path: string | null | undefined) {
  return extname(path ?? '').toLowerCase() === '.md' ? 'markdown' : 'json';
}

async function ensureSpecialistDeleteSafe(
  sqlite: Database,
  projectId: string,
  specialistId: string,
) {
  const row = sqlite
    .prepare(
      `
        SELECT
          boards.name AS board_name,
          columns.name AS column_name
        FROM project_kanban_columns columns
        INNER JOIN project_kanban_boards boards
          ON boards.id = columns.board_id
        WHERE boards.project_id = ?
          AND boards.deleted_at IS NULL
          AND columns.deleted_at IS NULL
          AND json_extract(columns.automation_json, '$.specialistId') = ?
        LIMIT 1
      `,
    )
    .get(projectId, specialistId) as
    | {
        board_name: string;
        column_name: string;
      }
    | undefined;

  if (row) {
    throwSpecialistDeleteConflict(specialistId, row.board_name, row.column_name);
  }
}

export async function upsertSpecialist(
  sqlite: Database,
  input: UpsertSpecialistInput,
) {
  await getProjectById(sqlite, input.projectId);

  const existingList = await listSpecialists(sqlite, {
    projectId: input.projectId,
  });
  const existing =
    existingList.items.find((item) => item.id === input.id) ?? null;
  const format =
    input.format ??
    resolveSpecialistFileFormat(existing?.source.path);
  const definitionContent = input.definitionContent?.trim();
  let specialist: SpecialistPayload | null = null;

  if (definitionContent && definitionContent.length > 0) {
    try {
      specialist = parseSpecialistContent(definitionContent, format, input.id);
    } catch (error) {
      throwSpecialistDefinitionInvalid(
        error instanceof Error ? error.message : 'Failed to parse specialist definition',
      );
    }
  }

  if (!specialist) {
    const name = input.name ?? existing?.name;
    const role = input.role ?? existing?.role;
    const systemPrompt = input.systemPrompt ?? existing?.systemPrompt;

    if (!name || !role || !systemPrompt) {
      throwSpecialistDefinitionInvalid(
        'Structured specialist upsert requires name, role, and systemPrompt',
      );
    }

    if (!isRoleValue(role)) {
      throwInvalidRole(role);
    }

    specialist = {
      defaultAdapter: input.defaultAdapter ?? existing?.defaultAdapter ?? null,
      description: input.description ?? existing?.description ?? null,
      id: input.id,
      modelTier: input.modelTier ?? existing?.modelTier ?? null,
      name,
      role,
      roleReminder: input.roleReminder ?? existing?.roleReminder ?? null,
      source: {
        path: join(
          getUserSpecialistsDirectory(),
          `${input.id}.${format === 'markdown' ? 'md' : 'json'}`,
        ),
        scope: 'user',
      },
      systemPrompt,
    };
  }

  if (!specialist || specialist.id !== input.id) {
    throwSpecialistDefinitionInvalid(
      `Specialist definition must resolve to id ${input.id}`,
    );
  }

  const targetPath = join(
    getUserSpecialistsDirectory(),
    `${input.id}.${format === 'markdown' ? 'md' : 'json'}`,
  );
  await mkdir(getUserSpecialistsDirectory(), {
    recursive: true,
  });
  await writeFile(
    targetPath,
    definitionContent && definitionContent.length > 0
      ? definitionContent
      : serializeSpecialistFile(
          {
            defaultAdapter: specialist.defaultAdapter,
            description: specialist.description,
            id: specialist.id,
            modelTier: specialist.modelTier,
            name: specialist.name,
            role: specialist.role,
            roleReminder: specialist.roleReminder,
            systemPrompt: specialist.systemPrompt,
          },
          format,
        ),
    'utf8',
  );

  const obsoletePath = existing?.source.scope === 'user' ? existing.source.path : null;
  if (obsoletePath && obsoletePath !== targetPath) {
    await unlink(obsoletePath).catch(() => undefined);
  }

  return await getSpecialistById(sqlite, input.projectId, input.id);
}

export async function deleteSpecialist(
  sqlite: Database,
  input: {
    projectId: string;
    specialistId: string;
  },
) {
  const specialist = await getSpecialistById(
    sqlite,
    input.projectId,
    input.specialistId,
  );

  if (specialist.source.scope !== 'user') {
    throwSpecialistSourceImmutable(input.specialistId, specialist.source.scope);
  }

  await ensureSpecialistDeleteSafe(sqlite, input.projectId, input.specialistId);
  await unlink(specialist.source.path);

  return specialist;
}

export async function getDefaultSpecialistByRole(
  sqlite: Database,
  projectId: string,
  role: RoleValue,
) {
  return getSpecialistById(sqlite, projectId, defaultSpecialistIdByRole[role]);
}

export function ensureRoleValue(role: string | null | undefined) {
  if (!role) {
    return null;
  }

  if (!isRoleValue(role)) {
    throwInvalidRole(role);
  }

  return role;
}
