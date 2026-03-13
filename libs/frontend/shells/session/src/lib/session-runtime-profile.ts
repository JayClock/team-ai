import type { AgentRole, ProjectOrchestrationMode } from '@shared/schema';

export type WorkbenchSessionRole = Extract<AgentRole, 'ROUTA' | 'DEVELOPER'>;

export type WorkbenchSessionRuntimeProfile = {
  defaultProviderId: string | null;
  orchestrationMode: ProjectOrchestrationMode;
};

export type WorkbenchSessionDefaults = {
  providerId: string | null;
  role: WorkbenchSessionRole;
};

type ResolveWorkbenchSessionDefaultsInput = {
  recentSessionProvider?: string | null;
  runtimeProfile?: WorkbenchSessionRuntimeProfile | null;
  selectedSessionProvider?: string | null;
};

function normalizeProviderId(value: string | null | undefined): string | null {
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
    providerId:
      normalizeProviderId(input.runtimeProfile?.defaultProviderId) ??
      normalizeProviderId(input.selectedSessionProvider) ??
      normalizeProviderId(input.recentSessionProvider),
    role: resolveWorkbenchSessionRole(input.runtimeProfile?.orchestrationMode),
  };
}

export function resolveWorkbenchProviderLabel(
  providerId: string | null | undefined,
): string {
  return normalizeProviderId(providerId) ?? '未配置 provider';
}
