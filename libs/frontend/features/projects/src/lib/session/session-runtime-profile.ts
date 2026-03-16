import type { AgentRole, ProjectOrchestrationMode } from '@shared/schema';

export type WorkbenchSessionRole = Extract<AgentRole, 'ROUTA' | 'DEVELOPER'>;

export type WorkbenchSessionRuntimeProfile = {
  defaultModel: string | null;
  defaultProviderId: string | null;
  orchestrationMode: ProjectOrchestrationMode;
};

export type WorkbenchSessionDefaults = {
  model: string | null;
  providerId: string | null;
  role: WorkbenchSessionRole;
};

type ResolveWorkbenchSessionDefaultsInput = {
  recentSessionModel?: string | null;
  recentSessionProvider?: string | null;
  runtimeProfile?: WorkbenchSessionRuntimeProfile | null;
  selectedSessionModel?: string | null;
  selectedSessionProvider?: string | null;
};

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveWorkbenchSessionRole(
  orchestrationMode: ProjectOrchestrationMode | null | undefined,
): WorkbenchSessionRole {
  return orchestrationMode === 'DEVELOPER' ? 'DEVELOPER' : 'ROUTA';
}

export function resolveWorkbenchSessionDefaults(
  input: ResolveWorkbenchSessionDefaultsInput,
): WorkbenchSessionDefaults {
  return {
    model:
      normalizeOptionalText(input.runtimeProfile?.defaultModel) ??
      normalizeOptionalText(input.selectedSessionModel) ??
      normalizeOptionalText(input.recentSessionModel),
    providerId:
      normalizeOptionalText(input.runtimeProfile?.defaultProviderId) ??
      normalizeOptionalText(input.selectedSessionProvider) ??
      normalizeOptionalText(input.recentSessionProvider),
    role: resolveWorkbenchSessionRole(input.runtimeProfile?.orchestrationMode),
  };
}

export function resolveWorkbenchProviderLabel(
  providerId: string | null | undefined,
): string {
  return normalizeOptionalText(providerId) ?? '未配置 provider';
}
