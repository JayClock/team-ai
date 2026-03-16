import type { Database } from 'better-sqlite3';
import { constants as fsConstants } from 'node:fs';
import { access, readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { resolveDataDirectory } from '../db/sqlite';
import { ProblemError } from '../errors/problem-error';
import type {
  FlowTemplateListPayload,
  FlowTemplatePayload,
} from '../schemas/flow-template';
import { getProjectById } from './project-service';

type FlowTemplateScope = FlowTemplatePayload['source']['scope'];

interface FlowTemplateFilePayload {
  description?: string | null;
  id?: string;
  name?: string;
  noteType?: string;
}

function throwFlowTemplateNotFound(templateId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/flow-template-not-found',
    title: 'Flow Template Not Found',
    status: 404,
    detail: `Flow template ${templateId} was not found`,
  });
}

function getBuiltInFlowTemplatesDirectory() {
  return join(__dirname, '..', '..', 'assets', 'flow-templates');
}

function getUserFlowTemplatesDirectory() {
  return join(resolveDataDirectory(), 'flow-templates');
}

function getUserLibrariesDirectory() {
  return join(resolveDataDirectory(), 'libraries');
}

function getWorkspaceFlowTemplatesDirectory(projectRepoPath: string) {
  return join(projectRepoPath, 'resources', 'flow-templates');
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
      metadata: {} as FlowTemplateFilePayload,
    };
  }

  const endIndex = content.indexOf('\n---\n', 4);

  if (endIndex === -1) {
    return {
      body: content.trim(),
      metadata: {} as FlowTemplateFilePayload,
    };
  }

  const frontmatter = content.slice(4, endIndex);
  const metadata: FlowTemplateFilePayload = {};

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
    } else if (key === 'description') {
      metadata.description = value || null;
    } else if (key === 'noteType') {
      metadata.noteType = value || 'spec';
    }
  }

  return {
    body: content.slice(endIndex + 5).trim(),
    metadata,
  };
}

function normalizeFlowTemplate(
  filePath: string,
  scope: FlowTemplateScope,
  payload: FlowTemplateFilePayload & {
    content?: string;
  },
  fallbackId: string,
  libraryId: string | null = null,
) {
  const noteType = payload.noteType?.trim() || 'spec';

  if (
    !payload.id ||
    !payload.name ||
    !payload.content ||
    (noteType !== 'spec' && noteType !== 'general' && noteType !== 'task')
  ) {
    return null;
  }

  return {
    content: payload.content,
    description: payload.description ?? null,
    id: payload.id || fallbackId,
    name: payload.name,
    noteType,
    source: {
      libraryId,
      path: filePath,
      scope,
    },
  } satisfies FlowTemplatePayload;
}

async function readFlowTemplateFile(
  filePath: string,
  scope: FlowTemplateScope,
  libraryId: string | null = null,
) {
  const extension = extname(filePath).toLowerCase();
  const fallbackId = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? filePath;
  const content = await readFile(filePath, 'utf8');

  if (extension === '.json') {
    return normalizeFlowTemplate(
      filePath,
      scope,
      JSON.parse(content) as FlowTemplateFilePayload & { content?: string },
      fallbackId,
      libraryId,
    );
  }

  if (extension === '.md') {
    const parsed = parseFrontmatter(content);
    return normalizeFlowTemplate(
      filePath,
      scope,
      {
        ...parsed.metadata,
        content: parsed.body,
      },
      fallbackId,
      libraryId,
    );
  }

  return null;
}

async function loadDirectoryTemplates(
  directoryPath: string,
  scope: FlowTemplateScope,
  libraryId: string | null = null,
) {
  if (!(await canReadDirectory(directoryPath))) {
    return [] as FlowTemplatePayload[];
  }

  const entries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  const templates: FlowTemplatePayload[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const extension = extname(entry.name).toLowerCase();

    if (extension !== '.json' && extension !== '.md') {
      continue;
    }

    const template = await readFlowTemplateFile(
      join(directoryPath, entry.name),
      scope,
      libraryId,
    );

    if (template) {
      templates.push(template);
    }
  }

  return templates;
}

async function loadLibraryTemplates(librariesDirectory: string) {
  if (!(await canReadDirectory(librariesDirectory))) {
    return [] as FlowTemplatePayload[];
  }

  const entries = await readdir(librariesDirectory, {
    withFileTypes: true,
  });
  const templates: FlowTemplatePayload[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    templates.push(
      ...(await loadDirectoryTemplates(
        join(librariesDirectory, entry.name, 'flow-templates'),
        'library',
        entry.name,
      )),
    );
  }

  return templates;
}

function mergeTemplates(groups: FlowTemplatePayload[][]) {
  const merged = new Map<string, FlowTemplatePayload>();

  for (const group of groups) {
    for (const template of group) {
      merged.set(template.id, template);
    }
  }

  return [...merged.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

async function listResolvedFlowTemplates(projectRepoPath?: string | null) {
  const builtIn = await loadDirectoryTemplates(
    getBuiltInFlowTemplatesDirectory(),
    'builtin',
  );
  const sharedLibraries = await loadLibraryTemplates(getUserLibrariesDirectory());
  const workspaceLibraries = projectRepoPath
    ? await loadLibraryTemplates(getWorkspaceLibrariesDirectory(projectRepoPath))
    : [];
  const workspace = projectRepoPath
    ? await loadDirectoryTemplates(
        getWorkspaceFlowTemplatesDirectory(projectRepoPath),
        'workspace',
      )
    : [];
  const user = await loadDirectoryTemplates(
    getUserFlowTemplatesDirectory(),
    'user',
  );

  return mergeTemplates([
    builtIn,
    sharedLibraries,
    workspaceLibraries,
    workspace,
    user,
  ]);
}

export async function listFlowTemplates(
  sqlite: Database,
  options: {
    noteType?: FlowTemplatePayload['noteType'];
    projectId?: string;
  } = {},
): Promise<FlowTemplateListPayload> {
  const project = options.projectId
    ? await getProjectById(sqlite, options.projectId)
    : null;
  const items = await listResolvedFlowTemplates(project?.repoPath);

  return {
    items:
      options.noteType === undefined
        ? items
        : items.filter((item) => item.noteType === options.noteType),
    noteType: options.noteType,
    projectId: options.projectId,
  };
}

export async function getFlowTemplateById(
  sqlite: Database,
  projectId: string,
  templateId: string,
) {
  const payload = await listFlowTemplates(sqlite, {
    projectId,
  });
  const template = payload.items.find((item) => item.id === templateId);

  if (!template) {
    throwFlowTemplateNotFound(templateId);
  }

  return template;
}

export function renderFlowTemplate(
  template: Pick<FlowTemplatePayload, 'content'>,
  variables: Record<string, string | null | undefined>,
) {
  return template.content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = variables[key];
    return value === null || value === undefined ? '' : value;
  });
}
