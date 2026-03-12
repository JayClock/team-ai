import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import BetterSqlite3 from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase, resolveDatabasePath } from './sqlite';

describe('sqlite migration compatibility', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('treats legacy repository metadata migration as satisfying the split project migrations', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-sqlite-compat-'));
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

    await mkdir(dataDir, { recursive: true });
    const bootstrap = new BetterSqlite3(resolveDatabasePath());

    bootstrap.exec(`
      CREATE TABLE schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        theme TEXT NOT NULL,
        model_provider TEXT NOT NULL,
        default_model TEXT NOT NULL,
        sync_enabled INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        workspace_root TEXT,
        source_type TEXT,
        source_url TEXT,
        default_branch TEXT
      );

      INSERT INTO schema_migrations(version, applied_at)
      VALUES ('007_project_repository_metadata', '2026-03-09T07:03:31.425Z');
    `);
    bootstrap.close();

    const sqlite = initializeDatabase();

    const migrations = sqlite
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as Array<{ version: string }>;
    const projectColumns = sqlite
      .prepare('PRAGMA table_info(projects)')
      .all() as Array<{ name: string }>;

    expect(migrations.map(({ version }) => version)).toContain(
      '007_project_repository_metadata',
    );
    expect(projectColumns.map(({ name }) => name)).toContain('workspace_root');
    expect(projectColumns.map(({ name }) => name)).toContain('source_type');
    expect(projectColumns.map(({ name }) => name)).toContain('source_url');

    sqlite.close();
  });

  it('drops legacy orchestration tables when upgrading an existing local database', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-sqlite-orch-drop-'));
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

    await mkdir(dataDir, { recursive: true });
    const bootstrap = new BetterSqlite3(resolveDatabasePath());

    bootstrap.exec(`
      CREATE TABLE schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        theme TEXT NOT NULL,
        model_provider TEXT NOT NULL,
        default_model TEXT NOT NULL,
        sync_enabled INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sync_conflicts (
        id TEXT PRIMARY KEY,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        title TEXT NOT NULL,
        local_summary TEXT NOT NULL,
        remote_summary TEXT NOT NULL,
        status TEXT NOT NULL,
        resolution TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE orchestration_sessions (
        id TEXT PRIMARY KEY
      );

      CREATE TABLE orchestration_steps (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL
      );

      CREATE TABLE orchestration_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL
      );

      CREATE TABLE orchestration_artifacts (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        step_id TEXT NOT NULL
      );

      INSERT INTO schema_migrations(version, applied_at)
      VALUES
        ('001_initial_schema', '2026-03-09T07:03:31.425Z'),
        ('003_agents_table', '2026-03-09T07:03:31.425Z'),
        ('004_orchestration_tables', '2026-03-09T07:03:31.425Z'),
        ('005_sync_tables', '2026-03-09T07:03:31.425Z'),
        ('006_orchestration_runtime_metadata', '2026-03-09T07:03:31.425Z'),
        ('007_project_workspace_root', '2026-03-09T07:03:31.425Z'),
        ('008_project_repository_source', '2026-03-09T07:03:31.425Z'),
        ('009_project_acp_sessions', '2026-03-09T07:03:31.425Z'),
        ('010_remove_conversations_and_messages', '2026-03-09T07:03:31.425Z'),
        ('011_project_acp_session_cwd', '2026-03-09T07:03:31.425Z'),
        ('013_project_tasks', '2026-03-09T07:03:31.425Z'),
        ('014_project_agents', '2026-03-09T07:03:31.425Z'),
        ('015_acp_session_agents', '2026-03-09T07:03:31.425Z'),
        ('016_remove_project_sessions', '2026-03-09T07:03:31.425Z'),
        ('017_drop_acp_session_mode', '2026-03-09T07:03:31.425Z');
    `);
    bootstrap.close();

    const sqlite = initializeDatabase();

    const migrations = sqlite
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as Array<{ version: string }>;
    const remainingOrchestrationTables = sqlite
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name IN (
              'orchestration_sessions',
              'orchestration_steps',
              'orchestration_events',
              'orchestration_artifacts'
            )
          ORDER BY name
        `,
      )
      .all() as Array<{ name: string }>;

    expect(migrations.map(({ version }) => version)).toContain(
      '018_drop_orchestration_tables',
    );
    expect(remainingOrchestrationTables).toEqual([]);

    sqlite.close();
  });

  it('removes legacy orchestration sync conflicts when upgrading an existing local database', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-sqlite-orch-sync-'));
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

    await mkdir(dataDir, { recursive: true });
    const bootstrap = new BetterSqlite3(resolveDatabasePath());

    bootstrap.exec(`
      CREATE TABLE schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        theme TEXT NOT NULL,
        model_provider TEXT NOT NULL,
        default_model TEXT NOT NULL,
        sync_enabled INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sync_conflicts (
        id TEXT PRIMARY KEY,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        title TEXT NOT NULL,
        local_summary TEXT NOT NULL,
        remote_summary TEXT NOT NULL,
        status TEXT NOT NULL,
        resolution TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO sync_conflicts (
        id,
        resource_type,
        resource_id,
        title,
        local_summary,
        remote_summary,
        status,
        resolution,
        created_at,
        updated_at
      )
      VALUES
        (
          'syncc_orchestration',
          'orchestration-session',
          'orch_1',
          'Old orchestration conflict',
          'local orchestration',
          'remote orchestration',
          'open',
          NULL,
          '2026-03-09T07:03:31.425Z',
          '2026-03-09T07:03:31.425Z'
        ),
        (
          'syncc_project',
          'project',
          'project_1',
          'Project conflict',
          'local project',
          'remote project',
          'open',
          NULL,
          '2026-03-09T07:03:31.425Z',
          '2026-03-09T07:03:31.425Z'
        );

      INSERT INTO schema_migrations(version, applied_at)
      VALUES
        ('001_initial_schema', '2026-03-09T07:03:31.425Z'),
        ('003_agents_table', '2026-03-09T07:03:31.425Z'),
        ('004_orchestration_tables', '2026-03-09T07:03:31.425Z'),
        ('005_sync_tables', '2026-03-09T07:03:31.425Z'),
        ('006_orchestration_runtime_metadata', '2026-03-09T07:03:31.425Z'),
        ('007_project_workspace_root', '2026-03-09T07:03:31.425Z'),
        ('008_project_repository_source', '2026-03-09T07:03:31.425Z'),
        ('009_project_acp_sessions', '2026-03-09T07:03:31.425Z'),
        ('010_remove_conversations_and_messages', '2026-03-09T07:03:31.425Z'),
        ('011_project_acp_session_cwd', '2026-03-09T07:03:31.425Z'),
        ('013_project_tasks', '2026-03-09T07:03:31.425Z'),
        ('014_project_agents', '2026-03-09T07:03:31.425Z'),
        ('015_acp_session_agents', '2026-03-09T07:03:31.425Z'),
        ('016_remove_project_sessions', '2026-03-09T07:03:31.425Z'),
        ('017_drop_acp_session_mode', '2026-03-09T07:03:31.425Z'),
        ('018_drop_orchestration_tables', '2026-03-09T07:03:31.425Z');
    `);
    bootstrap.close();

    const sqlite = initializeDatabase();

    const migrations = sqlite
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as Array<{ version: string }>;
    const remainingConflicts = sqlite
      .prepare(
        `
          SELECT id, resource_type
          FROM sync_conflicts
          ORDER BY id
        `,
      )
      .all() as Array<{ id: string; resource_type: string }>;

    expect(migrations.map(({ version }) => version)).toContain(
      '019_cleanup_orchestration_sync_conflicts',
    );
    expect(remainingConflicts).toEqual([
      {
        id: 'syncc_project',
        resource_type: 'project',
      },
    ]);

    sqlite.close();
  });
});
