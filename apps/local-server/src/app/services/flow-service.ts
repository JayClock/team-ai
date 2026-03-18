import type { Database } from 'better-sqlite3';
import { constants as fsConstants } from 'node:fs';
import { access, readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { parse } from 'yaml';
import { resolveDataDirectory } from '../db/sqlite';
import { ProblemError } from '../errors/problem-error';
import type {
  FlowListPayload,
  FlowPayload,
  FlowStepPayload,
  FlowTriggerPayload,
  FlowTriggerType,
} from '../schemas/flow';
import { getProjectById } from './project-service';

type FlowScope = FlowPayload['source']['scope'];

interface FlowFilePayload {
  description?: unknown;
  id?: unknown;
  name?: unknown;
  steps?: unknown;
  trigger?: unknown;
  variables?: unknown;
  version?: unknown;
}

interface FlowStepFilePayload {
  adapter?: unknown;
  config?: unknown;
  input?: unknown;
  name?: unknown;
  output_key?: unknown;
  specialist?: unknown;
}

function throwFlowNotFound(flowId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/flow-not-found',
    title: 'Flow Not Found',
    status: 404,
    detail: `Flow ${flowId} was not found`,
  });
}

function getBuiltInFlowsDirectory() {
  return join(__dirname, '..', '..', 'assets', 'flows');
}

function getUserFlowsDirectory() {
  return join(resolveDataDirectory(), 'flows');
}

function getUserLibrariesDirectory() {
  return join(resolveDataDirectory(), 'libraries');
}

function getWorkspaceFlowsDirectory(projectRepoPath: string) {
  return join(projectRepoPath, 'resources', 'flows');
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

function normalizeOptionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isStringEntry(
  entry: [string, unknown],
): entry is [string, string] {
  return typeof entry[1] === 'string';
}

function normalizeVariables(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(isStringEntry)
    .map(([key, entryValue]) => [key, entryValue.trim()] as const)
    .filter(([, entryValue]) => entryValue.length > 0);

  return Object.fromEntries(entries);
}

function normalizeTrigger(value: unknown): FlowTriggerPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const trigger = value as Record<string, unknown>;
  const typeValue = normalizeOptionalText(trigger.type);
  const type: FlowTriggerType | null =
    typeValue === 'manual' || typeValue === 'schedule' || typeValue === 'webhook'
      ? typeValue
      : null;

  if (!type) {
    return null;
  }

  return {
    event: normalizeOptionalText(trigger.event),
    source: normalizeOptionalText(trigger.source),
    type,
  };
}

function normalizeStep(step: unknown): FlowStepPayload | null {
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    return null;
  }

  const payload = step as FlowStepFilePayload;
  const name = normalizeOptionalText(payload.name);
  const specialistId = normalizeOptionalText(payload.specialist);
  const input = typeof payload.input === 'string' ? payload.input.trim() : null;

  if (!name || !specialistId || !input) {
    return null;
  }

  const config =
    payload.config &&
    typeof payload.config === 'object' &&
    !Array.isArray(payload.config)
      ? Object.fromEntries(
          Object.entries(payload.config as Record<string, unknown>)
            .filter(isStringEntry)
            .map(([key, value]) => [key, value.trim()] as const),
        )
      : {};

  return {
    adapter: normalizeOptionalText(payload.adapter),
    config,
    input,
    name,
    outputKey: normalizeOptionalText(payload.output_key),
    specialistId,
  };
}

function normalizeFlow(
  filePath: string,
  scope: FlowScope,
  payload: FlowFilePayload,
  fallbackId: string,
  libraryId: string | null = null,
) {
  const id = normalizeOptionalText(payload.id) ?? fallbackId;
  const name = normalizeOptionalText(payload.name);
  const trigger = normalizeTrigger(payload.trigger);
  const steps = Array.isArray(payload.steps)
    ? payload.steps
        .map(normalizeStep)
        .filter((step): step is FlowStepPayload => step !== null)
    : [];

  if (!name || !trigger || steps.length === 0) {
    return null;
  }

  return {
    description: normalizeOptionalText(payload.description),
    id,
    name,
    source: {
      libraryId,
      path: filePath,
      scope,
    },
    steps,
    trigger,
    variables: normalizeVariables(payload.variables),
    version: normalizeOptionalText(payload.version),
  } satisfies FlowPayload;
}

async function readFlowFile(
  filePath: string,
  scope: FlowScope,
  libraryId: string | null = null,
) {
  const extension = extname(filePath).toLowerCase();
  const fallbackId = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? filePath;

  if (extension !== '.yaml' && extension !== '.yml' && extension !== '.json') {
    return null;
  }

  const content = await readFile(filePath, 'utf8');

  try {
    const parsed =
      extension === '.json'
        ? (JSON.parse(content) as FlowFilePayload)
        : (parse(content) as FlowFilePayload);

    return normalizeFlow(filePath, scope, parsed, fallbackId, libraryId);
  } catch {
    return null;
  }
}

async function loadDirectoryFlows(
  directoryPath: string,
  scope: FlowScope,
  libraryId: string | null = null,
) {
  if (!(await canReadDirectory(directoryPath))) {
    return [] as FlowPayload[];
  }

  const entries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  const flows: FlowPayload[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const flow = await readFlowFile(
      join(directoryPath, entry.name),
      scope,
      libraryId,
    );

    if (flow) {
      flows.push(flow);
    }
  }

  return flows;
}

async function loadLibraryFlows(librariesDirectory: string) {
  if (!(await canReadDirectory(librariesDirectory))) {
    return [] as FlowPayload[];
  }

  const entries = await readdir(librariesDirectory, {
    withFileTypes: true,
  });
  const flows: FlowPayload[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    flows.push(
      ...(await loadDirectoryFlows(
        join(librariesDirectory, entry.name, 'flows'),
        'library',
        entry.name,
      )),
    );
  }

  return flows;
}

function mergeFlows(groups: FlowPayload[][]) {
  const merged = new Map<string, FlowPayload>();

  for (const group of groups) {
    for (const flow of group) {
      merged.set(flow.id, flow);
    }
  }

  return [...merged.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

async function listResolvedFlows(projectRepoPath?: string | null) {
  const builtIn = await loadDirectoryFlows(getBuiltInFlowsDirectory(), 'builtin');
  const sharedLibraries = await loadLibraryFlows(getUserLibrariesDirectory());
  const workspaceLibraries = projectRepoPath
    ? await loadLibraryFlows(getWorkspaceLibrariesDirectory(projectRepoPath))
    : [];
  const workspace = projectRepoPath
    ? await loadDirectoryFlows(getWorkspaceFlowsDirectory(projectRepoPath), 'workspace')
    : [];
  const user = await loadDirectoryFlows(getUserFlowsDirectory(), 'user');

  return mergeFlows([
    builtIn,
    sharedLibraries,
    workspaceLibraries,
    workspace,
    user,
  ]);
}

export async function listFlows(
  sqlite: Database,
  projectId: string,
): Promise<FlowListPayload> {
  const project = await getProjectById(sqlite, projectId);

  return {
    items: await listResolvedFlows(project.repoPath),
    projectId,
  };
}

export async function getFlowById(
  sqlite: Database,
  projectId: string,
  flowId: string,
) {
  const payload = await listFlows(sqlite, projectId);
  const flow = payload.items.find((item) => item.id === flowId);

  if (!flow) {
    throwFlowNotFound(flowId);
  }

  return flow;
}
