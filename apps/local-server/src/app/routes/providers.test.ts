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
import providersRoute from './providers';

describe('providers route', () => {
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

  it('lists provider-scoped model links from the providers collection', async () => {
    const fastify = await createTestServer();

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/providers',
    });

    expect(response.statusCode).toBe(200);
    expect(responseContentType(response)).toBe(VENDOR_MEDIA_TYPES.providers);
    expect(response.json()).toMatchObject({
      _embedded: {
        providers: [
          expect.objectContaining({
            defaultModel: null,
            id: 'opencode',
            modelsHref: '/api/providers/opencode/models',
          }),
        ],
      },
    });
  });

  it('lists models for a specific provider', async () => {
    const fastify = await createTestServer({
      providerModelCommandRunner: async () => ({
        stdout: 'openai/gpt-5-mini\nopenai/gpt-5\ninvalid-line\n',
        stderr: '',
      }),
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/providers/opencode/models',
    });

    expect(response.statusCode).toBe(200);
    expect(responseContentType(response)).toBe(
      VENDOR_MEDIA_TYPES.providerModels,
    );
    expect(response.json()).toMatchObject({
      _embedded: {
        models: [
          {
            id: 'openai/gpt-5-mini',
            name: 'openai/gpt-5-mini',
            providerId: 'opencode',
          },
          {
            id: 'openai/gpt-5',
            name: 'openai/gpt-5',
            providerId: 'opencode',
          },
        ],
      },
      _links: {
        self: {
          href: '/api/providers/opencode/models',
        },
      },
    });
  });

  it('returns 404 for unknown providers', async () => {
    const fastify = await createTestServer();

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/providers/unknown/models',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      detail: 'Provider unknown was not found',
      title: 'Provider Not Found',
    });
  });

  async function createTestServer(options?: {
    providerModelCommandRunner?: (
      command: string,
      args: string[],
    ) => Promise<{ stderr: string; stdout: string }>;
  }) {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-providers-route-'));
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

    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite as Database);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(providersRoute, {
      prefix: '/api',
      providerModelCommandRunner: options?.providerModelCommandRunner,
    });
    await fastify.ready();

    return fastify;
  }
});
