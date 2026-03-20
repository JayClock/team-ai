import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { asc } from 'drizzle-orm';
import BetterSqlite3 from 'better-sqlite3';
import { attachDrizzleDb, type LocalDatabase } from './drizzle';
import { sqliteMigrations } from './migrations';
import { schemaMigrationsTable, settingsTable } from './schema';

const defaultBusyTimeoutMs = 5_000;

export function resolveDataDirectory(): string {
  return process.env.TEAMAI_DATA_DIR ?? join(process.cwd(), '.team-ai');
}

export function resolveDatabasePath(): string {
  return join(resolveDataDirectory(), 'team-ai.db');
}

export function initializeDatabase(): LocalDatabase {
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

  const sqlite = attachDrizzleDb(database);
  const db = sqlite.orm;
  const appliedVersions = new Set<string>(
    db
      .select({
        version: schemaMigrationsTable.version,
      })
      .from(schemaMigrationsTable)
      .orderBy(asc(schemaMigrationsTable.version))
      .all()
      .map(({ version }) => String(version)),
  );

  const runMigration = database.transaction((version: string, sql: string) => {
    database.exec(sql);
    db.insert(schemaMigrationsTable)
      .values({
        version,
        appliedAt: new Date().toISOString(),
      })
      .run();
  });

  for (const migration of sqliteMigrations) {
    if (!appliedVersions.has(migration.version)) {
      runMigration(migration.version, migration.sql);
    }
  }

  db.insert(settingsTable)
    .values({
      id: 1,
      theme: 'system',
      syncEnabled: false,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run();

  return sqlite;
}
