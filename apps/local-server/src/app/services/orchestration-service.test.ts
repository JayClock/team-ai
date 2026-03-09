import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { OrchestrationStreamBroker } from '../plugins/orchestration-stream';
import { createProject } from './project-service';
import {
  createOrchestrationSession,
  getOrchestrationSessionById,
  listOrchestrationSteps,
} from './orchestration-service';

describe('orchestration storage metadata', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('applies runtime metadata migration and exposes new session fields', async () => {
    const sqlite = await createTestDatabase();
    const broker = new OrchestrationStreamBroker();

    const project = await createProject(sqlite, {
      title: 'Storage Migration Project',
      description: 'Test orchestration storage metadata',
    });

    const { session } = await createOrchestrationSession(sqlite, broker, {
      projectId: project.id,
      title: 'Implement local workflow',
      goal: 'Wire local orchestration runtime',
      provider: 'codex',
      executionMode: 'local',
      workspaceRoot: '/tmp/team-ai-workspace',
      traceId: 'trace-storage-1',
    });

    const reloadedSession = await getOrchestrationSessionById(sqlite, session.id);
    const steps = await listOrchestrationSteps(sqlite, session.id);

    expect(reloadedSession.provider).toBe('codex');
    expect(reloadedSession.executionMode).toBe('local');
    expect(reloadedSession.workspaceRoot).toBe('/tmp/team-ai-workspace');
    expect(reloadedSession.traceId).toBe('trace-storage-1');

    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.role)).toEqual([
      'planner',
      'crafter',
      'gate',
    ]);
    expect(steps.every((step) => step.artifacts.length === 0)).toBe(true);
    expect(steps.every((step) => step.runtimeSessionId === null)).toBe(true);
    expect(steps.every((step) => step.errorCode === null)).toBe(true);
  });

  it('creates the orchestration_artifacts table and runtime metadata columns', async () => {
    const sqlite = await createTestDatabase();

    const artifactTable = sqlite
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table' AND name = 'orchestration_artifacts'
        `,
      )
      .get() as { name: string } | undefined;

    const sessionColumns = (
      sqlite.prepare(`PRAGMA table_info(orchestration_sessions)`).all() as Array<{
        name: string;
      }>
    ).map((column) => column.name);

    const stepColumns = (
      sqlite.prepare(`PRAGMA table_info(orchestration_steps)`).all() as Array<{
        name: string;
      }>
    ).map((column) => column.name);

    expect(artifactTable?.name).toBe('orchestration_artifacts');
    expect(sessionColumns).toEqual(
      expect.arrayContaining([
        'provider',
        'workspace_root',
        'execution_mode',
        'trace_id',
      ]),
    );
    expect(stepColumns).toEqual(
      expect.arrayContaining([
        'role',
        'input_json',
        'output_json',
        'runtime_session_id',
        'runtime_cursor',
        'started_at',
        'completed_at',
        'error_code',
        'error_message',
      ]),
    );
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-local-server-'));
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
