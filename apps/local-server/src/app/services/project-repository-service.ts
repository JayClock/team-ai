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
  findProjectByRepoPath,
  findProjectBySourceUrl,
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
  repoPath: string;
  repo: string;
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
        repoPath: join(cloneBaseDir, `${owner}--${repo}`),
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
      repoPath: join(cloneBaseDir, `${owner}--${repo}`),
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
  repoPath: string,
): Promise<ProjectPayload | undefined> {
  const projectBySource = await findProjectBySourceUrl(sqlite, sourceUrl);
  const projectByRepoPath = await findProjectByRepoPath(sqlite, repoPath);

  if (
    projectBySource &&
    projectByRepoPath &&
    projectBySource.id !== projectByRepoPath.id
  ) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/project-source-conflict',
      title: 'Project Source Conflict',
      status: 409,
      detail:
        'Repository source and managed workspace are currently bound to different projects',
    });
  }

  return projectBySource ?? projectByRepoPath;
}

function buildProjectPatch(
  current: ProjectPayload,
  input: CloneProjectRepositoryInput,
  sourceUrl: string,
  repoPath: string,
): UpdateProjectInput {
  const patch: UpdateProjectInput = {
    repoPath,
    sourceType: 'github',
    sourceUrl,
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
  repoPath: string,
  repo: string,
): Promise<ProjectPayload> {
  const existingProject = await resolveExistingProject(sqlite, sourceUrl, repoPath);

  if (existingProject) {
    return updateProject(
      sqlite,
      existingProject.id,
      buildProjectPatch(existingProject, input, sourceUrl, repoPath),
    );
  }

  return createProject(sqlite, {
    title: input.title?.trim() || repo,
    description: input.description?.trim() || undefined,
    repoPath,
    sourceType: 'github',
    sourceUrl,
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

  const alreadyCloned = await dependencies.pathExists(parsed.repoPath);

  if (alreadyCloned) {
    await dependencies.runGit(['pull', '--ff-only'], parsed.repoPath).catch(() => undefined);

    return {
      cloneStatus: 'reused',
      project: await upsertProjectForRepository(
        sqlite,
        input,
        parsed.canonicalSourceUrl,
        parsed.repoPath,
        parsed.repo,
      ),
    };
  }

  await dependencies.runGit([
    'clone',
    '--depth',
    '1',
    parsed.cloneUrl,
    parsed.repoPath,
  ]);
  await dependencies.runGit(['fetch', '--all'], parsed.repoPath).catch(() => undefined);

  return {
    cloneStatus: 'cloned',
    project: await upsertProjectForRepository(
      sqlite,
      input,
      parsed.canonicalSourceUrl,
      parsed.repoPath,
      parsed.repo,
    ),
  };
}
