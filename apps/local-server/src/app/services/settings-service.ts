import type { Database } from 'better-sqlite3';
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
  const row = sqlite
    .prepare(
      `
        SELECT
          theme,
          sync_enabled,
          updated_at
        FROM settings
        WHERE id = 1
      `,
    )
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

  sqlite
    .prepare(
      `
        UPDATE settings
        SET
          theme = @theme,
          sync_enabled = @syncEnabled,
          updated_at = @updatedAt
        WHERE id = 1
      `,
    )
    .run({
      theme: next.theme,
      syncEnabled: next.syncEnabled ? 1 : 0,
      updatedAt: next.updatedAt,
    });

  return next;
}
