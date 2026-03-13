import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import { createProject } from '../services/project-service';
import { responseContentType } from '../test-support/response-content-type';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import runtimeProfileRoute from './runtime-profile';

describe('runtime profile routes', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }

    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('creates a default runtime profile on first read and persists updates', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Runtime Profile Project',
      repoPath: '/tmp/team-ai-runtime-profile',
    });

    const initialResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/runtime-profile`,
    });

    expect(initialResponse.statusCode).toBe(200);
    expect(responseContentType(initialResponse)).toBe(
      VENDOR_MEDIA_TYPES.projectRuntimeProfile,
    );
    expect(initialResponse.json()).toMatchObject({
      defaultModel: null,
      defaultProviderId: null,
      enabledMcpServerIds: [],
      enabledSkillIds: [],
      mcpServerConfigs: {},
      orchestrationMode: 'ROUTA',
      projectId: project.id,
      skillConfigs: {},
    });

    const patchResponse = await fastify.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}/runtime-profile`,
      payload: {
        defaultModel: 'gpt-5.4',
        defaultProviderId: 'opencode',
        enabledMcpServerIds: ['team_ai_local'],
        enabledSkillIds: ['reviewer'],
        mcpServerConfigs: {
          team_ai_local: {
            timeoutMs: 2000,
          },
        },
        orchestrationMode: 'DEVELOPER',
        skillConfigs: {
          reviewer: {
            level: 'strict',
          },
        },
      },
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(responseContentType(patchResponse)).toBe(
      VENDOR_MEDIA_TYPES.projectRuntimeProfile,
    );
    expect(patchResponse.json()).toMatchObject({
      defaultModel: 'gpt-5.4',
      defaultProviderId: 'opencode',
      enabledMcpServerIds: ['team_ai_local'],
      enabledSkillIds: ['reviewer'],
      mcpServerConfigs: {
        team_ai_local: {
          timeoutMs: 2000,
        },
      },
      orchestrationMode: 'DEVELOPER',
      projectId: project.id,
      skillConfigs: {
        reviewer: {
          level: 'strict',
        },
      },
    });

    const secondReadResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/runtime-profile`,
    });

    expect(secondReadResponse.statusCode).toBe(200);
    expect(secondReadResponse.json()).toMatchObject({
      defaultModel: 'gpt-5.4',
      defaultProviderId: 'opencode',
      enabledMcpServerIds: ['team_ai_local'],
      enabledSkillIds: ['reviewer'],
      mcpServerConfigs: {
        team_ai_local: {
          timeoutMs: 2000,
        },
      },
      orchestrationMode: 'DEVELOPER',
      projectId: project.id,
      skillConfigs: {
        reviewer: {
          level: 'strict',
        },
      },
    });
  });

  it('reads legacy runtime profiles that predate config columns with safe defaults', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Legacy Runtime Profile Project',
      repoPath: '/tmp/team-ai-runtime-profile-legacy',
    });
    const now = new Date().toISOString();

    sqlite
      .prepare(
        `
          INSERT INTO project_runtime_profiles (
            id,
            project_id,
            default_provider_id,
            default_model,
            orchestration_mode,
            enabled_skill_ids_json,
            enabled_mcp_server_ids_json,
            created_at,
            updated_at,
            deleted_at
          )
          VALUES (
            @id,
            @projectId,
            @defaultProviderId,
            @defaultModel,
            @orchestrationMode,
            @enabledSkillIdsJson,
            @enabledMcpServerIdsJson,
            @createdAt,
            @updatedAt,
            NULL
          )
        `,
      )
      .run({
        id: 'rprof_legacycompat01',
        projectId: project.id,
        defaultProviderId: 'codex',
        defaultModel: 'gpt-4.1-mini',
        orchestrationMode: 'DEVELOPER',
        enabledSkillIdsJson: JSON.stringify(['reviewer']),
        enabledMcpServerIdsJson: JSON.stringify(['team_ai_local']),
        createdAt: now,
        updatedAt: now,
      });

    const response = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/runtime-profile`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      defaultModel: 'gpt-4.1-mini',
      defaultProviderId: 'codex',
      enabledMcpServerIds: ['team_ai_local'],
      enabledSkillIds: ['reviewer'],
      mcpServerConfigs: {},
      orchestrationMode: 'DEVELOPER',
      projectId: project.id,
      skillConfigs: {},
    });
  });

  it('preserves existing runtime profile fields when only provider and mode change', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Runtime Profile Partial Update Project',
      repoPath: '/tmp/team-ai-runtime-profile-partial',
    });

    await fastify.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}/runtime-profile`,
      payload: {
        defaultModel: 'gpt-5.4',
        enabledMcpServerIds: ['team_ai_local'],
        enabledSkillIds: ['reviewer'],
        mcpServerConfigs: {
          team_ai_local: {
            timeoutMs: 2000,
          },
        },
        skillConfigs: {
          reviewer: {
            level: 'strict',
          },
        },
      },
    });

    const response = await fastify.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}/runtime-profile`,
      payload: {
        defaultProviderId: 'opencode',
        orchestrationMode: 'DEVELOPER',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      defaultModel: 'gpt-5.4',
      defaultProviderId: 'opencode',
      enabledMcpServerIds: ['team_ai_local'],
      enabledSkillIds: ['reviewer'],
      mcpServerConfigs: {
        team_ai_local: {
          timeoutMs: 2000,
        },
      },
      orchestrationMode: 'DEVELOPER',
      projectId: project.id,
      skillConfigs: {
        reviewer: {
          level: 'strict',
        },
      },
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(
      join(tmpdir(), 'team-ai-runtime-profile-route-'),
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

  async function createTestServer(sqlite: Database) {
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(runtimeProfileRoute, { prefix: '/api' });
    await fastify.ready();

    return fastify;
  }
});
