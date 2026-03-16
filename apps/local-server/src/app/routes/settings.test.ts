import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import settingsRoute from './settings';

describe('settings route', () => {
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

  it('returns settings without legacy model ownership fields', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/settings',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      theme: 'system',
      syncEnabled: false,
    });
    expect(response.json().defaultModel).toBeUndefined();
    expect(response.json().modelProvider).toBeUndefined();
  });

  it('rejects legacy model ownership patch fields', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);

    const response = await fastify.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: {
        defaultModel: 'gpt-5',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-settings-route-'));
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
    await fastify.register(settingsRoute, { prefix: '/api' });
    await fastify.ready();

    return fastify;
  }
});
