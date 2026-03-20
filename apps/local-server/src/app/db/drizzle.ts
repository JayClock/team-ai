import type { Database } from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sqliteSchema } from './schema';

export type LocalDatabase = Database & {
  orm: BetterSQLite3Database<typeof sqliteSchema>;
};

const ormByDatabase = new WeakMap<Database, BetterSQLite3Database<typeof sqliteSchema>>();

export function getDrizzleDb(
  sqlite: Database,
): BetterSQLite3Database<typeof sqliteSchema> {
  const existing = ormByDatabase.get(sqlite);
  if (existing) {
    return existing;
  }

  const orm = drizzle(sqlite, {
    schema: sqliteSchema,
  });
  ormByDatabase.set(sqlite, orm);
  return orm;
}

export function attachDrizzleDb(sqlite: Database): LocalDatabase {
  const orm = getDrizzleDb(sqlite);

  Object.defineProperty(sqlite, 'orm', {
    configurable: false,
    enumerable: false,
    value: orm,
    writable: false,
  });

  return sqlite as LocalDatabase;
}
