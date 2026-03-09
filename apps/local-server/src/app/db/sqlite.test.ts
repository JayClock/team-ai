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
});
