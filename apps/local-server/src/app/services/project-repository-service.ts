import type { Database } from 'better-sqlite3';
import { ProblemError } from '@orchestration/runtime-acp';
import type { ProjectPayload, UpdateProjectInput } from '../schemas/project';
import {
  createProject,
  findProjectByRepoPath,
  findProjectBySourceUrl,
  updateProject,
} from './project-service';
import {
  ensureManagedRepository,
  type ManagedRepositoryServiceDependencies as ProjectRepositoryServiceDependencies,
} from './managed-repository-service';

export interface CloneProjectRepositoryInput {
  description?: string;
  repositoryUrl: string;
  title?: string;
}

export interface CloneProjectRepositoryResult {
  cloneStatus: 'cloned' | 'reused';
  project: ProjectPayload;
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
  dependencies?: ProjectRepositoryServiceDependencies,
): Promise<CloneProjectRepositoryResult> {
  const result = await ensureManagedRepository(input.repositoryUrl, dependencies);

  return {
    cloneStatus: result.cloneStatus,
    project: await upsertProjectForRepository(
      sqlite,
      input,
      result.repository.canonicalSourceUrl,
      result.repository.repoPath,
      result.repository.repo,
    ),
  };
}
