import type {
  AgentRole,
  ProjectOrchestrationMode,
  RoleValue,
} from '@shared/schema';
import type {
  ProjectRuntimeRoleDefault,
  ProjectRuntimeRoleDefaults,
} from '@shared/schema/lib/runtime-profile';

export type WorkbenchSessionRole = Extract<AgentRole, 'ROUTA' | 'DEVELOPER'>;
export const workbenchRuntimeRoles = [
  'ROUTA',
  'CRAFTER',
  'GATE',
  'DEVELOPER',
] as const satisfies RoleValue[];

export type WorkbenchSessionRuntimeProfile = {
  orchestrationMode: ProjectOrchestrationMode;
  roleDefaults: ProjectRuntimeRoleDefaults;
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

function normalizeRoleDefault(
  value: ProjectRuntimeRoleDefault | null | undefined,
): ProjectRuntimeRoleDefault | null {
  const providerId = normalizeOptionalText(value?.providerId);
  const model = normalizeOptionalText(value?.model);

  if (!providerId && !model) {
    return null;
  }

  return {
    model,
    providerId,
  };
}

export function resolveWorkbenchRuntimeRoleDefault(
  roleDefaults: ProjectRuntimeRoleDefaults | null | undefined,
  role: RoleValue,
): ProjectRuntimeRoleDefault | null {
  return normalizeRoleDefault(roleDefaults?.[role]);
}

export function resolveWorkbenchSessionDefaults(
  input: ResolveWorkbenchSessionDefaultsInput,
): WorkbenchSessionDefaults {
  const role = resolveWorkbenchSessionRole(input.runtimeProfile?.orchestrationMode);
  const roleDefault = resolveWorkbenchRuntimeRoleDefault(
    input.runtimeProfile?.roleDefaults,
    role,
  );

  return {
    model:
      normalizeOptionalText(roleDefault?.model) ??
      normalizeOptionalText(input.selectedSessionModel) ??
      normalizeOptionalText(input.recentSessionModel),
    providerId:
      normalizeOptionalText(roleDefault?.providerId) ??
      normalizeOptionalText(input.selectedSessionProvider) ??
      normalizeOptionalText(input.recentSessionProvider),
    role,
  };
}

export function resolveWorkbenchProviderLabel(
  providerId: string | null | undefined,
): string {
  return normalizeOptionalText(providerId) ?? '未配置 provider';
}
