export interface SettingsPayload {
  syncEnabled: boolean;
  theme: 'system' | 'light' | 'dark';
  updatedAt: string;
}

export type SettingsPatch = Partial<Pick<SettingsPayload, 'syncEnabled' | 'theme'>>;
