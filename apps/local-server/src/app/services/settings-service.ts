import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { SettingsPatch, SettingsPayload } from '../schemas/settings';

const defaultSettings: Omit<SettingsPayload, 'updatedAt'> = {
  theme: 'system',
  modelProvider: 'deepseek',
  defaultModel: 'deepseek-chat',
  syncEnabled: false,
};

function createSettingsPath(): string {
  const dataDir = process.env.TEAMAI_DATA_DIR ?? join(process.cwd(), '.team-ai');

  return join(dataDir, 'settings.json');
}

async function ensureSettingsDirectoryExists(settingsPath: string) {
  await mkdir(dirname(settingsPath), { recursive: true });
}

function createDefaultSettings(): SettingsPayload {
  return {
    ...defaultSettings,
    updatedAt: new Date().toISOString(),
  };
}

export async function getSettings(): Promise<SettingsPayload> {
  const settingsPath = createSettingsPath();

  try {
    const raw = await readFile(settingsPath, 'utf8');

    return JSON.parse(raw) as SettingsPayload;
  } catch {
    const settings = createDefaultSettings();
    await persistSettings(settings);

    return settings;
  }
}

export async function updateSettings(
  patch: SettingsPatch,
): Promise<SettingsPayload> {
  const current = await getSettings();
  const next: SettingsPayload = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await persistSettings(next);

  return next;
}

async function persistSettings(settings: SettingsPayload): Promise<void> {
  const settingsPath = createSettingsPath();
  await ensureSettingsDirectoryExists(settingsPath);
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}
