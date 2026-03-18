import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { ProblemError } from '../errors/problem-error';

const execFileAsync = promisify(execFile);
const MAX_FILES_TO_SCAN = 10_000;

const DEFAULT_IGNORES = new Set([
  '.cache',
  '.git',
  '.idea',
  '.next',
  '.turbo',
  '.venv',
  '.vscode',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
  'venv',
]);

const DEFAULT_FILE_PRIORITY = [
  'readme.md',
  'package.json',
  'pnpm-workspace.yaml',
  'nx.json',
  'tsconfig.base.json',
  'build.gradle',
  'settings.gradle',
];

export type RepositoryFileMatch = {
  fullPath: string;
  name: string;
  path: string;
  score: number;
};

export type RepositoryFileSearchResult = {
  files: RepositoryFileMatch[];
  query: string;
  scanned: number;
  total: number;
};

function throwInvalidRepositoryPath(detail: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/invalid-repository-path',
    title: 'Invalid Repository Path',
    status: 400,
    detail,
  });
}

function throwRepositoryPathNotFound(repoPath: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/repository-path-not-found',
    title: 'Repository Path Not Found',
    status: 404,
    detail: `Repository path ${repoPath} does not exist`,
  });
}

function shouldIgnoreEntry(name: string) {
  if (DEFAULT_IGNORES.has(name)) {
    return true;
  }

  return (
    name.endsWith('.lock') ||
    name.endsWith('.log') ||
    name === 'package-lock.json' ||
    name === 'yarn.lock'
  );
}

function fuzzyMatch(query: string, target: string) {
  const normalizedQuery = query.toLowerCase();
  const normalizedTarget = target.toLowerCase();

  if (normalizedTarget === normalizedQuery) {
    return 1_000;
  }

  if (normalizedTarget.includes(normalizedQuery)) {
    const filename = basename(normalizedTarget);

    if (filename.startsWith(normalizedQuery)) {
      return 900;
    }

    if (filename.includes(normalizedQuery)) {
      return 800;
    }

    return 700;
  }

  let score = 0;
  let queryIndex = 0;
  let consecutiveBonus = 0;

  for (
    let targetIndex = 0;
    targetIndex < normalizedTarget.length && queryIndex < normalizedQuery.length;
    targetIndex += 1
  ) {
    if (normalizedTarget[targetIndex] !== normalizedQuery[queryIndex]) {
      consecutiveBonus = 0;
      continue;
    }

    score += 10 + consecutiveBonus;
    consecutiveBonus += 5;
    queryIndex += 1;
  }

  if (queryIndex < normalizedQuery.length) {
    return 0;
  }

  return score + Math.max(0, 100 - target.length);
}

function defaultFileRank(filePath: string) {
  const filename = basename(filePath).toLowerCase();
  const priorityIndex = DEFAULT_FILE_PRIORITY.indexOf(filename);

  if (priorityIndex !== -1) {
    return priorityIndex;
  }

  return filePath.includes('/') ? DEFAULT_FILE_PRIORITY.length + 1 : DEFAULT_FILE_PRIORITY.length;
}

async function assertRepositoryPath(repoPath: string) {
  const normalizedRepoPath = repoPath.trim();

  if (!normalizedRepoPath) {
    throwInvalidRepositoryPath('repoPath is required');
  }

  if (!isAbsolute(normalizedRepoPath)) {
    throwInvalidRepositoryPath('repoPath must be an absolute local path');
  }

  try {
    const metadata = await stat(normalizedRepoPath);

    if (!metadata.isDirectory()) {
      throwRepositoryPathNotFound(normalizedRepoPath);
    }
  } catch {
    throwRepositoryPathNotFound(normalizedRepoPath);
  }
}

async function listGitFiles(repoPath: string) {
  const result = await execFileAsync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    {
      cwd: repoPath,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 5_000,
    },
  );

  return Array.from(
    new Set(
      result.stdout
        .split('\n')
        .map((value) => value.trim())
        .filter((value) => value),
    ),
  );
}

async function walkRepositoryFiles(repoPath: string) {
  const queue = [repoPath];
  const files: string[] = [];

  while (queue.length > 0 && files.length < MAX_FILES_TO_SCAN) {
    const currentDirectory = queue.pop();

    if (!currentDirectory) {
      continue;
    }

    let entries;
    try {
      entries = await readdir(currentDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (shouldIgnoreEntry(entry.name)) {
        continue;
      }

      const fullPath = join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      files.push(relative(repoPath, fullPath));

      if (files.length >= MAX_FILES_TO_SCAN) {
        break;
      }
    }
  }

  return files;
}

async function listRepositoryFiles(repoPath: string) {
  try {
    const gitFiles = await listGitFiles(repoPath);

    if (gitFiles.length > 0) {
      return gitFiles;
    }
  } catch {
    // Fall back to a plain directory walk when the repository is not a git repo.
  }

  return walkRepositoryFiles(repoPath);
}

function toFileMatch(repoPath: string, filePath: string, score: number) {
  return {
    fullPath: join(repoPath, filePath),
    name: basename(filePath),
    path: filePath,
    score,
  };
}

export async function searchRepositoryFiles(input: {
  limit: number;
  query?: string;
  repoPath: string;
}): Promise<RepositoryFileSearchResult> {
  const repoPath = input.repoPath.trim();
  const query = input.query?.trim() ?? '';

  await assertRepositoryPath(repoPath);

  const files = await listRepositoryFiles(repoPath);

  if (!query) {
    const defaultFiles = [...files]
      .sort((left, right) => {
        const rankDelta = defaultFileRank(left) - defaultFileRank(right);

        if (rankDelta !== 0) {
          return rankDelta;
        }

        const lengthDelta = left.length - right.length;
        if (lengthDelta !== 0) {
          return lengthDelta;
        }

        return left.localeCompare(right);
      })
      .slice(0, input.limit)
      .map((filePath) => toFileMatch(repoPath, filePath, 0));

    return {
      files: defaultFiles,
      query,
      scanned: files.length,
      total: files.length,
    };
  }

  const matches = files
    .map((filePath) => ({
      filePath,
      score: fuzzyMatch(query, filePath),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return left.filePath.length - right.filePath.length;
    });

  return {
    files: matches
      .slice(0, input.limit)
      .map((entry) => toFileMatch(repoPath, entry.filePath, entry.score)),
    query,
    scanned: files.length,
    total: matches.length,
  };
}
