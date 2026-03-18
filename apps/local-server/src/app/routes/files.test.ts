import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import problemJsonPlugin from '../plugins/problem-json';
import filesRoute from './files';

const execFileAsync = promisify(execFile);

describe('files route', () => {
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

  it('searches repository files with fuzzy matching', async () => {
    const repoPath = await createGitRepository();
    const fastify = Fastify();
    fastifyInstances.push(fastify);

    await fastify.register(problemJsonPlugin);
    await fastify.register(filesRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: `/api/files/search?repoPath=${encodeURIComponent(repoPath)}&q=session&limit=5`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      files: [
        expect.objectContaining({
          name: 'project-session-workbench.tsx',
          path: 'src/lib/components/project-session-workbench.tsx',
        }),
      ],
      query: 'session',
    });
  });

  it('rejects relative repository paths', async () => {
    const fastify = Fastify();
    fastifyInstances.push(fastify);

    await fastify.register(problemJsonPlugin);
    await fastify.register(filesRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/files/search?repoPath=relative-repo',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      title: 'Invalid Repository Path',
      type: 'https://team-ai.dev/problems/invalid-repository-path',
    });
  });

  async function createGitRepository() {
    const repoPath = await mkdtemp(join(tmpdir(), 'team-ai-files-route-repo-'));
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });

    await mkdir(join(repoPath, 'src/lib/components'), { recursive: true });

    await writeFile(join(repoPath, 'README.md'), '# file search\n');
    await writeFile(
      join(repoPath, 'package.json'),
      JSON.stringify({ name: 'file-search-fixture' }, null, 2),
    );
    await writeFile(
      join(repoPath, 'src/lib/components/project-session-workbench.tsx'),
      'export const fixture = true;\n',
    );
    await writeFile(join(repoPath, 'src/main.ts'), 'export {};\n');

    await execFileAsync('git', ['init', '--initial-branch=main'], {
      cwd: repoPath,
    });
    await execFileAsync('git', ['config', 'user.name', 'Team AI Test'], {
      cwd: repoPath,
    });
    await execFileAsync('git', ['config', 'user.email', 'team-ai@example.test'], {
      cwd: repoPath,
    });
    await execFileAsync('git', ['add', '.'], { cwd: repoPath });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: repoPath });

    return repoPath;
  }
});
