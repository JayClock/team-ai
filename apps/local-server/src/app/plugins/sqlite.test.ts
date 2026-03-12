import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import sqlitePlugin from './sqlite';

describe('sqlite plugin', () => {
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];
  const cleanupTasks: Array<() => Promise<void>> = [];

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

  async function createServer(prefix: string) {
    const dataDir = await mkdtemp(join(tmpdir(), prefix));
    const previousDataDir = process.env.TEAMAI_DATA_DIR;
    process.env.TEAMAI_DATA_DIR = dataDir;

    cleanupTasks.push(async () => {
      if (previousDataDir === undefined) {
        delete process.env.TEAMAI_DATA_DIR;
      } else {
        process.env.TEAMAI_DATA_DIR = previousDataDir;
      }

      await rm(dataDir, { recursive: true, force: true });
    });

    const fastify = Fastify();
    fastifyInstances.push(fastify);
    await fastify.register(sqlitePlugin);
    await fastify.ready();

    return fastify;
  }

  it('creates a default project on startup when the database is empty', async () => {
    const fastify = await createServer('team-ai-sqlite-plugin-default-');

    const projects = fastify.sqlite
      .prepare(
        `
          SELECT title, description, workspace_root, source_type, source_url
          FROM projects
          WHERE deleted_at IS NULL
          ORDER BY updated_at DESC
        `,
      )
      .all() as Array<{
      description: string | null;
      source_type: string | null;
      source_url: string | null;
      title: string;
      workspace_root: string | null;
    }>;

    expect(projects).toEqual([
      {
        title: 'Default Project',
        description: null,
        workspace_root: null,
        source_type: null,
        source_url: null,
      },
    ]);
  });

  it('does not create a duplicate default project on restart', async () => {
    const dataDir = await mkdtemp(
      join(tmpdir(), 'team-ai-sqlite-plugin-restart-'),
    );
    const previousDataDir = process.env.TEAMAI_DATA_DIR;
    process.env.TEAMAI_DATA_DIR = dataDir;

    cleanupTasks.push(async () => {
      if (previousDataDir === undefined) {
        delete process.env.TEAMAI_DATA_DIR;
      } else {
        process.env.TEAMAI_DATA_DIR = previousDataDir;
      }

      await rm(dataDir, { recursive: true, force: true });
    });

    const first = Fastify();
    fastifyInstances.push(first);
    await first.register(sqlitePlugin);
    await first.ready();
    await first.close();
    fastifyInstances.pop();

    const second = Fastify();
    fastifyInstances.push(second);
    await second.register(sqlitePlugin);
    await second.ready();

    const count = second.sqlite
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM projects
          WHERE deleted_at IS NULL
        `,
      )
      .get() as { count: number };

    expect(count).toEqual({ count: 1 });
  });
});
