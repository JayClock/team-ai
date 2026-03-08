export interface SettingsPayload {
  defaultModel: string;
  modelProvider: string;
  syncEnabled: boolean;
  theme: 'system' | 'light' | 'dark';
  updatedAt: string;
}

export type SettingsPatch = Partial<
  Pick<SettingsPayload, 'defaultModel' | 'modelProvider' | 'syncEnabled' | 'theme'>
>;
