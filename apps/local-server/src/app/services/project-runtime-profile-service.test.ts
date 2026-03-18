import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProblemError } from '../errors/problem-error';
import { initializeDatabase } from '../db/sqlite';
import { createProject } from './project-service';
import {
  getProjectRuntimeProfile,
  updateProjectRuntimeProfile,
} from './project-runtime-profile-service';

const cleanupTasks: Array<() => Promise<void>> = [];

describe('project runtime profile service', () => {
  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('persists a default model when it belongs to the selected provider', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Runtime Profile Defaults',
      repoPath: '/tmp/team-ai-runtime-profile-defaults',
    });

    const profile = await updateProjectRuntimeProfile(
      sqlite,
      project.id,
      {
        roleDefaults: {
          DEVELOPER: {
            model: ' openai/gpt-5-mini ',
            providerId: ' opencode ',
          },
        },
      },
      {
        listProviderModels: vi.fn(async () => [
          {
            id: 'openai/gpt-5-mini',
            providerId: 'opencode',
          },
        ]),
      },
    );

    expect(profile.roleDefaults.DEVELOPER).toEqual({
      model: 'openai/gpt-5-mini',
      providerId: 'opencode',
    });

    await expect(getProjectRuntimeProfile(sqlite, project.id)).resolves.toMatchObject(
      {
        roleDefaults: {
          DEVELOPER: {
            model: 'openai/gpt-5-mini',
            providerId: 'opencode',
          },
        },
      },
    );
  });

  it('rejects saving a role model without a provider', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Runtime Profile Missing Provider',
      repoPath: '/tmp/team-ai-runtime-profile-missing-provider',
    });

    const error = await updateProjectRuntimeProfile(
      sqlite,
      project.id,
      {
        roleDefaults: {
          ROUTA: {
            model: 'openai/gpt-5-mini',
            providerId: null,
          },
        },
      },
      {
        listProviderModels: vi.fn(),
      },
    ).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ProblemError);
    expect(error).toMatchObject({
      status: 400,
      title: 'Runtime Profile Role Provider Required',
    });
  });

  it('rejects saving a role model that does not belong to the selected provider', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Runtime Profile Model Mismatch',
      repoPath: '/tmp/team-ai-runtime-profile-model-mismatch',
    });

    const error = await updateProjectRuntimeProfile(
      sqlite,
      project.id,
      {
        roleDefaults: {
          GATE: {
            model: 'openai/gpt-5',
            providerId: 'opencode',
          },
        },
      },
      {
        listProviderModels: vi.fn(async () => [
          {
            id: 'openai/gpt-5-mini',
            providerId: 'opencode',
          },
        ]),
      },
    ).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ProblemError);
    expect(error).toMatchObject({
      status: 400,
      title: 'Runtime Profile Role Model Provider Mismatch',
    });
    expect((error as ProblemError).message).toBe(
      'Model openai/gpt-5 is not available for provider opencode in role GATE',
    );
  });
});

async function createTestDatabase(): Promise<Database> {
  const dataDir = await mkdtemp(
    join(tmpdir(), 'team-ai-runtime-profile-service-'),
  );
  const previousDataDir = process.env.TEAMAI_DATA_DIR;

  process.env.TEAMAI_DATA_DIR = dataDir;
  const sqlite = initializeDatabase();

  cleanupTasks.push(async () => {
    sqlite.close();
    if (previousDataDir === undefined) {
      delete process.env.TEAMAI_DATA_DIR;
    } else {
      process.env.TEAMAI_DATA_DIR = previousDataDir;
    }
    await rm(dataDir, { recursive: true, force: true });
  });

  return sqlite;
}
