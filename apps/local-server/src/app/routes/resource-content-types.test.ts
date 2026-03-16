import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import { responseContentType } from '../test-support/response-content-type';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import acpRoute from './acp';
import meRoute from './me';
import providersRoute from './providers';
import settingsRoute from './settings';
import syncRoute from './sync';

describe('resource content types', () => {
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

  it('returns vendor media types for local desktop resources outside project routes', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);

    const meResponse = await fastify.inject({
      method: 'GET',
      url: '/api/me',
    });
    expect(meResponse.statusCode).toBe(200);
    expect(responseContentType(meResponse)).toBe(VENDOR_MEDIA_TYPES.user);

    const providersResponse = await fastify.inject({
      method: 'GET',
      url: '/api/providers',
    });
    expect(providersResponse.statusCode).toBe(200);
    expect(responseContentType(providersResponse)).toBe(
      VENDOR_MEDIA_TYPES.providers,
    );

    const providerModelsResponse = await fastify.inject({
      method: 'GET',
      url: '/api/providers/opencode/models',
    });
    expect(providerModelsResponse.statusCode).toBe(200);
    expect(responseContentType(providerModelsResponse)).toBe(
      VENDOR_MEDIA_TYPES.providerModels,
    );

    const settingsResponse = await fastify.inject({
      method: 'GET',
      url: '/api/settings',
    });
    expect(settingsResponse.statusCode).toBe(200);
    expect(responseContentType(settingsResponse)).toBe(
      VENDOR_MEDIA_TYPES.settings,
    );

    const syncStatusResponse = await fastify.inject({
      method: 'GET',
      url: '/api/sync/status',
    });
    expect(syncStatusResponse.statusCode).toBe(200);
    expect(responseContentType(syncStatusResponse)).toBe(
      VENDOR_MEDIA_TYPES.syncStatus,
    );

    const syncConflictsResponse = await fastify.inject({
      method: 'GET',
      url: '/api/sync/conflicts',
    });
    expect(syncConflictsResponse.statusCode).toBe(200);
    expect(responseContentType(syncConflictsResponse)).toBe(
      VENDOR_MEDIA_TYPES.syncConflicts,
    );

    const acpProvidersResponse = await fastify.inject({
      method: 'GET',
      url: '/api/acp/providers?registry=false',
    });
    expect(acpProvidersResponse.statusCode).toBe(200);
    expect(responseContentType(acpProvidersResponse)).toBe(
      VENDOR_MEDIA_TYPES.acpProviders,
    );
  });

  it('preserves vendor media types across mutable local desktop resources', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);

    const settingsPatchResponse = await fastify.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: {
        theme: 'light',
      },
    });
    expect(settingsPatchResponse.statusCode).toBe(200);
    expect(responseContentType(settingsPatchResponse)).toBe(
      VENDOR_MEDIA_TYPES.settings,
    );

    const syncRunResponse = await fastify.inject({
      method: 'POST',
      url: '/api/sync/run',
    });
    expect(syncRunResponse.statusCode).toBe(200);
    expect(responseContentType(syncRunResponse)).toBe(
      VENDOR_MEDIA_TYPES.syncStatus,
    );

    const syncPauseResponse = await fastify.inject({
      method: 'POST',
      url: '/api/sync/pause',
    });
    expect(syncPauseResponse.statusCode).toBe(200);
    expect(responseContentType(syncPauseResponse)).toBe(
      VENDOR_MEDIA_TYPES.syncStatus,
    );

    const syncResumeResponse = await fastify.inject({
      method: 'POST',
      url: '/api/sync/resume',
    });
    expect(syncResumeResponse.statusCode).toBe(200);
    expect(responseContentType(syncResumeResponse)).toBe(
      VENDOR_MEDIA_TYPES.syncStatus,
    );
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(
      join(tmpdir(), 'team-ai-resource-types-route-'),
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
    fastify.decorate('agentGatewayClient', {
      listProviders: async () => ({
        items: [],
      }),
    });

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(meRoute, { prefix: '/api' });
    await fastify.register(providersRoute, { prefix: '/api' });
    await fastify.register(settingsRoute, { prefix: '/api' });
    await fastify.register(syncRoute, { prefix: '/api' });
    await fastify.register(acpRoute, { prefix: '/api' });
    await fastify.ready();

    return fastify;
  }
});
