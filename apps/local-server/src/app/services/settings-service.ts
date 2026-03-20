import type { Database } from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { getDrizzleDb } from '../db/drizzle';
import { settingsTable } from '../db/schema';
import type { SettingsPatch, SettingsPayload } from '../schemas/settings';

interface SettingsRow {
  sync_enabled: number;
  theme: SettingsPayload['theme'];
  updated_at: string;
}

function mapSettingsRow(row: SettingsRow): SettingsPayload {
  return {
    theme: row.theme,
    syncEnabled: Boolean(row.sync_enabled),
    updatedAt: row.updated_at,
  };
}

export async function getSettings(sqlite: Database): Promise<SettingsPayload> {
  const row = getDrizzleDb(sqlite)
    .select({
      theme: settingsTable.theme,
      sync_enabled: settingsTable.syncEnabled,
      updated_at: settingsTable.updatedAt,
    })
    .from(settingsTable)
    .where(eq(settingsTable.id, 1))
    .get() as SettingsRow | undefined;

  if (!row) {
    throw new Error('Missing settings row in SQLite database');
  }

  return mapSettingsRow(row);
}

export async function updateSettings(
  sqlite: Database,
  patch: SettingsPatch,
): Promise<SettingsPayload> {
  const current = await getSettings(sqlite);
  const next: SettingsPayload = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  getDrizzleDb(sqlite)
    .update(settingsTable)
    .set({
      theme: next.theme,
      syncEnabled: next.syncEnabled,
      updatedAt: next.updatedAt,
    })
    .where(eq(settingsTable.id, 1))
    .run();

  return next;
}
