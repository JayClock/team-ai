import { execFile } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Database } from 'better-sqlite3';
import { resolveDataDirectory } from '../db/sqlite';
import { ProblemError } from '../errors/problem-error';
import type { ProjectPayload, UpdateProjectInput } from '../schemas/project';
import {
  createProject,
  findProjectBySourceUrl,
  findProjectByWorkspaceRoot,
  updateProject,
} from './project-service';

const execFileAsync = promisify(execFile);

const githubUrlPatterns = [
  /^https?:\/\/github\.com\/([^/]+)\/([^/\s#?.]+)/iu,
  /^git@github\.com:([^/]+)\/([^/\s#?.]+)/iu,
  /^github\.com\/([^/]+)\/([^/\s#?.]+)/iu,
];

const simpleOwnerRepoPattern = /^([a-zA-Z0-9\-_]+)\/([a-zA-Z0-9\-_.]+)$/u;

interface ParsedGithubRepository {
  canonicalSourceUrl: string;
  cloneUrl: string;
  owner: string;
  repo: string;
  workspaceRoot: string;
}

interface ProjectRepositoryServiceDependencies {
  ensureDirectory: (path: string) => Promise<void>;
  pathExists: (path: string) => Promise<boolean>;
  resolveCloneBaseDir: () => string;
  runGit: (args: string[], cwd?: string) => Promise<void>;
}

export interface CloneProjectRepositoryInput {
  description?: string;
  repositoryUrl: string;
  title?: string;
}

export interface CloneProjectRepositoryResult {
  cloneStatus: 'cloned' | 'reused';
  project: ProjectPayload;
}

const defaultDependencies: ProjectRepositoryServiceDependencies = {
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
  resolveCloneBaseDir() {
    return join(resolveDataDirectory(), 'repos');
  },
  async runGit(args, cwd) {
    await execFileAsync('git', args, {
      cwd,
      timeout: 180_000,
    });
  },
};

function parseGithubRepository(
  repositoryUrl: string,
  cloneBaseDir: string,
): ParsedGithubRepository {
  const trimmed = repositoryUrl.trim();

  for (const pattern of githubUrlPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const owner = match[1];
      const repo = match[2].replace(/\.git$/iu, '');

      return {
        owner,
        repo,
        canonicalSourceUrl: `https://github.com/${owner}/${repo}`,
        cloneUrl: `https://github.com/${owner}/${repo}.git`,
        workspaceRoot: join(cloneBaseDir, `${owner}--${repo}`),
      };
    }
  }

  const simpleMatch = trimmed.match(simpleOwnerRepoPattern);
  if (simpleMatch && !trimmed.includes('\\') && !trimmed.includes(':')) {
    const owner = simpleMatch[1];
    const repo = simpleMatch[2];

    return {
      owner,
      repo,
      canonicalSourceUrl: `https://github.com/${owner}/${repo}`,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      workspaceRoot: join(cloneBaseDir, `${owner}--${repo}`),
    };
  }

  throw new ProblemError({
    type: 'https://team-ai.dev/problems/invalid-repository-url',
    title: 'Invalid Repository URL',
    status: 400,
    detail:
      'Repository URL must be a GitHub URL or owner/repo form, for example https://github.com/owner/repo or owner/repo',
  });
}

async function resolveExistingProject(
  sqlite: Database,
  sourceUrl: string,
  workspaceRoot: string,
): Promise<ProjectPayload | undefined> {
  const projectBySource = await findProjectBySourceUrl(sqlite, sourceUrl);
  const projectByWorkspace = await findProjectByWorkspaceRoot(sqlite, workspaceRoot);

  if (
    projectBySource &&
    projectByWorkspace &&
    projectBySource.id !== projectByWorkspace.id
  ) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/project-source-conflict',
      title: 'Project Source Conflict',
      status: 409,
      detail:
        'Repository source and managed workspace are currently bound to different projects',
    });
  }

  return projectBySource ?? projectByWorkspace;
}

function buildProjectPatch(
  current: ProjectPayload,
  input: CloneProjectRepositoryInput,
  sourceUrl: string,
  workspaceRoot: string,
): UpdateProjectInput {
  const patch: UpdateProjectInput = {
    sourceType: 'github',
    sourceUrl,
    workspaceRoot,
  };

  if (input.title?.trim()) {
    patch.title = input.title.trim();
  }

  if (input.description !== undefined) {
    patch.description = input.description.trim() || null;
  }

  if (!current.sourceUrl) {
    patch.sourceUrl = sourceUrl;
  }

  if (!current.sourceType) {
    patch.sourceType = 'github';
  }

  return patch;
}

async function upsertProjectForRepository(
  sqlite: Database,
  input: CloneProjectRepositoryInput,
  sourceUrl: string,
  workspaceRoot: string,
  repo: string,
): Promise<ProjectPayload> {
  const existingProject = await resolveExistingProject(sqlite, sourceUrl, workspaceRoot);

  if (existingProject) {
    return updateProject(
      sqlite,
      existingProject.id,
      buildProjectPatch(existingProject, input, sourceUrl, workspaceRoot),
    );
  }

  return createProject(sqlite, {
    title: input.title?.trim() || repo,
    description: input.description?.trim() || undefined,
    sourceType: 'github',
    sourceUrl,
    workspaceRoot,
  });
}

export async function cloneProjectRepository(
  sqlite: Database,
  input: CloneProjectRepositoryInput,
  dependencies: ProjectRepositoryServiceDependencies = defaultDependencies,
): Promise<CloneProjectRepositoryResult> {
  const cloneBaseDir = dependencies.resolveCloneBaseDir();
  const parsed = parseGithubRepository(input.repositoryUrl, cloneBaseDir);

  await dependencies.ensureDirectory(cloneBaseDir);

  const alreadyCloned = await dependencies.pathExists(parsed.workspaceRoot);

  if (alreadyCloned) {
    await dependencies.runGit(['pull', '--ff-only'], parsed.workspaceRoot).catch(() => undefined);

    return {
      cloneStatus: 'reused',
      project: await upsertProjectForRepository(
        sqlite,
        input,
        parsed.canonicalSourceUrl,
        parsed.workspaceRoot,
        parsed.repo,
      ),
    };
  }

  await dependencies.runGit([
    'clone',
    '--depth',
    '1',
    parsed.cloneUrl,
    parsed.workspaceRoot,
  ]);
  await dependencies.runGit(['fetch', '--all'], parsed.workspaceRoot).catch(() => undefined);

  return {
    cloneStatus: 'cloned',
    project: await upsertProjectForRepository(
      sqlite,
      input,
      parsed.canonicalSourceUrl,
      parsed.workspaceRoot,
      parsed.repo,
    ),
  };
}
