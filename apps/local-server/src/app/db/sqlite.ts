import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import { sqliteMigrations } from './migrations';

const defaultBusyTimeoutMs = 5_000;

export function resolveDataDirectory(): string {
  return process.env.TEAMAI_DATA_DIR ?? join(process.cwd(), '.team-ai');
}

export function resolveDatabasePath(): string {
  return join(resolveDataDirectory(), 'team-ai.db');
}

export function initializeDatabase(): Database {
  const databasePath = resolveDatabasePath();
  mkdirSync(resolveDataDirectory(), { recursive: true });

  const database = new BetterSqlite3(databasePath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma(`busy_timeout = ${defaultBusyTimeoutMs}`);

  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedVersions = new Set<string>(
    (
      database
        .prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all() as Array<{ version: string }>
    ).map(({ version }) => String(version)),
  );

  const insertMigration = database.prepare(`
    INSERT INTO schema_migrations(version, applied_at)
    VALUES (@version, @appliedAt)
  `);

  const runMigration = database.transaction((version: string, sql: string) => {
    database.exec(sql);
    insertMigration.run({
      version,
      appliedAt: new Date().toISOString(),
    });
  });

  for (const migration of sqliteMigrations) {
    if (!appliedVersions.has(migration.version)) {
      runMigration(migration.version, migration.sql);
    }
  }

  database
    .prepare(
      `
        INSERT INTO settings (
          id,
          theme,
          sync_enabled,
          updated_at
        )
        VALUES (1, @theme, @syncEnabled, @updatedAt)
        ON CONFLICT(id) DO NOTHING
      `,
    )
    .run({
      theme: 'system',
      syncEnabled: 0,
      updatedAt: new Date().toISOString(),
    });

  return database;
}
