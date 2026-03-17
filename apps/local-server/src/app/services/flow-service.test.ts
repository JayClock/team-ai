import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { getFlowById, listFlows } from './flow-service';
import { createProject } from './project-service';

describe('flow service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('loads built-in and workspace flows with workspace precedence', async () => {
    const sqlite = await createTestDatabase();
    const repoPath = await mkdtemp(join(tmpdir(), 'team-ai-flow-workspace-'));
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });

    await mkdir(join(repoPath, 'resources', 'flows'), {
      recursive: true,
    });
    await writeFile(
      join(repoPath, 'resources', 'flows', 'simple-dev.yaml'),
      [
        'name: "Workspace Developer Task"',
        'description: "Workspace override"',
        'trigger:',
        '  type: manual',
        'steps:',
        '  - name: "Execute Workspace Task"',
        '    specialist: "developer"',
        '    input: |',
        '      ${trigger.payload}',
      ].join('\n'),
      'utf8',
    );

    const project = await createProject(sqlite, {
      repoPath,
      title: 'Workspace Flow Project',
    });

    const payload = await listFlows(sqlite, project.id);
    const simpleDev = payload.items.find((flow) => flow.id === 'simple-dev');

    expect(payload.items.map((flow) => flow.id)).toEqual(
      expect.arrayContaining(['simple-dev']),
    );
    expect(simpleDev).toMatchObject({
      name: 'Workspace Developer Task',
      source: {
        scope: 'workspace',
      },
    });
  });

  it('loads user library flows before workspace overrides', async () => {
    const sqlite = await createTestDatabase();
    const repoPath = await mkdtemp(join(tmpdir(), 'team-ai-flow-library-'));
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });

    const libraryDir = join(
      process.env.TEAMAI_DATA_DIR as string,
      'libraries',
      'shared-ops',
      'flows',
    );
    await mkdir(libraryDir, {
      recursive: true,
    });
    await writeFile(
      join(libraryDir, 'code-review.yaml'),
      [
        'name: "Shared Review Flow"',
        'trigger:',
        '  type: manual',
        'steps:',
        '  - name: "Review"',
        '    specialist: "gate"',
        '    input: |',
        '      Review ${trigger.payload}',
      ].join('\n'),
      'utf8',
    );

    const project = await createProject(sqlite, {
      repoPath,
      title: 'Library Flow Project',
    });

    const libraryFlow = await getFlowById(sqlite, project.id, 'code-review');

    expect(libraryFlow).toMatchObject({
      name: 'Shared Review Flow',
      source: {
        libraryId: 'shared-ops',
        scope: 'library',
      },
    });

    await mkdir(join(repoPath, 'resources', 'flows'), {
      recursive: true,
    });
    await writeFile(
      join(repoPath, 'resources', 'flows', 'code-review.yaml'),
      [
        'name: "Workspace Review Flow"',
        'trigger:',
        '  type: manual',
        'steps:',
        '  - name: "Review"',
        '    specialist: "gate"',
        '    input: |',
        '      Review ${trigger.payload}',
      ].join('\n'),
      'utf8',
    );

    const workspaceFlow = await getFlowById(sqlite, project.id, 'code-review');

    expect(workspaceFlow).toMatchObject({
      name: 'Workspace Review Flow',
      source: {
        scope: 'workspace',
      },
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-flow-service-'));
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
});
