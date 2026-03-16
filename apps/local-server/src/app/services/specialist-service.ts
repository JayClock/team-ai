import type { Database } from 'better-sqlite3';
import { constants as fsConstants } from 'node:fs';
import { access, readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { resolveDataDirectory } from '../db/sqlite';
import { ProblemError } from '../errors/problem-error';
import { isRoleValue, type RoleValue } from '../schemas/role';
import type {
  SpecialistListPayload,
  SpecialistPayload,
} from '../schemas/specialist';
import { getProjectById } from './project-service';

type SpecialistSourceScope = SpecialistPayload['source']['scope'];

interface SpecialistFilePayload {
  description?: string | null;
  id?: string;
  modelTier?: string | null;
  name?: string;
  role?: string;
  systemPrompt?: string;
}

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
    } else if (key === 'modelTier') {
      metadata.modelTier = value || null;
    }
  }

  return {
    body: content.slice(endIndex + 5).trim(),
    metadata,
  };
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
    description: payload.description ?? null,
    id: payload.id || fallbackId,
    modelTier: payload.modelTier ?? null,
    name: payload.name,
    role: payload.role,
    source: {
      path: filePath,
      scope,
    },
    systemPrompt: payload.systemPrompt,
  } satisfies SpecialistPayload;
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
  const specialist = payload.items.find((item) => item.id === specialistId);

  if (!specialist) {
    throwSpecialistNotFound(specialistId);
  }

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
