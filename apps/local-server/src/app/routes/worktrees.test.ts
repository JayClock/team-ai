import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import { createProject } from '../services/project-service';
import { listProjectCodebases } from '../services/project-codebase-service';
import { responseContentType } from '../test-support/response-content-type';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import worktreesRoute from './worktrees';

const execFileAsync = promisify(execFile);

describe('worktrees route', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    while (fastifyInstances.length > 0) {
      await fastifyInstances.pop()?.close();
    }

    while (cleanupTasks.length > 0) {
      await cleanupTasks.pop()?.();
    }
  });

  it('creates, lists, loads, validates, and deletes worktrees', async () => {
    const sqlite = await createTestDatabase();
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(worktreesRoute, { prefix: '/api' });
    await fastify.ready();

    const repoPath = await createGitRepository();
    const project = await createProject(sqlite, {
      title: 'Route Worktrees',
      repoPath,
    });
    const codebase = (await listProjectCodebases(sqlite, project.id)).items[0];

    const createResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/codebases/${codebase.id}/worktrees`,
      payload: {
        label: 'Route Feature',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(responseContentType(createResponse)).toBe(VENDOR_MEDIA_TYPES.worktree);
    const created = createResponse.json() as { id: string };

    const listResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/codebases/${codebase.id}/worktrees`,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(responseContentType(listResponse)).toBe(VENDOR_MEDIA_TYPES.worktrees);
    expect(listResponse.json()).toMatchObject({
      _embedded: {
        worktrees: [expect.objectContaining({ id: created.id })],
      },
    });

    const getResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/worktrees/${created.id}`,
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({
      id: created.id,
    });

    const validateResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/worktrees/${created.id}/validate`,
    });
    expect(validateResponse.statusCode).toBe(200);
    expect(validateResponse.json()).toEqual({ healthy: true });

    const deleteResponse = await fastify.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}/worktrees/${created.id}`,
    });
    expect(deleteResponse.statusCode).toBe(204);
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-worktree-route-'));
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

  async function createGitRepository() {
    const repoPath = await mkdtemp(join(tmpdir(), 'team-ai-worktree-route-repo-'));
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });

    await mkdir(repoPath, { recursive: true });
    await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: repoPath });
    await execFileAsync('git', ['config', 'user.name', 'Team AI Test'], {
      cwd: repoPath,
    });
    await execFileAsync('git', ['config', 'user.email', 'team-ai@example.test'], {
      cwd: repoPath,
    });
    await writeFile(join(repoPath, 'README.md'), '# route test\n');
    await execFileAsync('git', ['add', 'README.md'], { cwd: repoPath });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: repoPath });
    return repoPath;
  }
});
