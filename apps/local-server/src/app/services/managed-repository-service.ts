import { execFile } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { resolveDataDirectory } from '../db/sqlite';
import { ProblemError } from '../errors/problem-error';

const execFileAsync = promisify(execFile);

const githubUrlPatterns = [
  /^https?:\/\/github\.com\/([^/]+)\/([^/\s#?.]+)/iu,
  /^git@github\.com:([^/]+)\/([^/\s#?.]+)/iu,
  /^github\.com\/([^/]+)\/([^/\s#?.]+)/iu,
];

const simpleOwnerRepoPattern = /^([a-zA-Z0-9\-_]+)\/([a-zA-Z0-9\-_.]+)$/u;

export interface ParsedGithubRepository {
  canonicalSourceUrl: string;
  cloneUrl: string;
  owner: string;
  repo: string;
  repoPath: string;
}

export interface ManagedRepositoryServiceDependencies {
  ensureDirectory: (path: string) => Promise<void>;
  pathExists: (path: string) => Promise<boolean>;
  resolveCloneBaseDir: () => string;
  runGit: (args: string[], cwd?: string) => Promise<void>;
}

export interface EnsureManagedRepositoryResult {
  cloneStatus: 'cloned' | 'reused';
  repository: ParsedGithubRepository;
}

const defaultDependencies: ManagedRepositoryServiceDependencies = {
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

export function parseGithubRepository(
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

export async function ensureManagedRepository(
  repositoryUrl: string,
  dependencies: ManagedRepositoryServiceDependencies = defaultDependencies,
): Promise<EnsureManagedRepositoryResult> {
  const cloneBaseDir = dependencies.resolveCloneBaseDir();
  const repository = parseGithubRepository(repositoryUrl, cloneBaseDir);

  await dependencies.ensureDirectory(cloneBaseDir);

  const alreadyCloned = await dependencies.pathExists(repository.repoPath);

  if (alreadyCloned) {
    await dependencies
      .runGit(['pull', '--ff-only'], repository.repoPath)
      .catch(() => undefined);

    return {
      cloneStatus: 'reused',
      repository,
    };
  }

  await dependencies.runGit([
    'clone',
    '--depth',
    '1',
    repository.cloneUrl,
    repository.repoPath,
  ]);
  await dependencies
    .runGit(['fetch', '--all'], repository.repoPath)
    .catch(() => undefined);

  return {
    cloneStatus: 'cloned',
    repository,
  };
}

