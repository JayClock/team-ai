import type { RoleValue } from './role';

export type ProjectOrchestrationMode = 'ROUTA' | 'DEVELOPER';

export type ProjectRuntimeProfileConfig = Record<string, unknown>;
export type ProjectRuntimeProfileConfigMap = Record<
  string,
  ProjectRuntimeProfileConfig
>;

export interface ProjectRuntimeRoleDefault {
  model: string | null;
  providerId: string | null;
}

export type ProjectRuntimeRoleDefaults = Partial<
  Record<RoleValue, ProjectRuntimeRoleDefault>
>;

export interface ProjectRuntimeProfilePayload {
  createdAt: string;
  defaultModel: string | null;
  defaultProviderId: string | null;
  enabledMcpServerIds: string[];
  enabledSkillIds: string[];
  id: string;
  mcpServerConfigs: ProjectRuntimeProfileConfigMap;
  orchestrationMode: ProjectOrchestrationMode;
  projectId: string;
  roleDefaults: ProjectRuntimeRoleDefaults;
  skillConfigs: ProjectRuntimeProfileConfigMap;
  updatedAt: string;
}

export interface UpdateProjectRuntimeProfileInput {
  defaultModel?: string | null;
  defaultProviderId?: string | null;
  enabledMcpServerIds?: string[];
  enabledSkillIds?: string[];
  mcpServerConfigs?: ProjectRuntimeProfileConfigMap;
  orchestrationMode?: ProjectOrchestrationMode;
  roleDefaults?: ProjectRuntimeRoleDefaults;
  skillConfigs?: ProjectRuntimeProfileConfigMap;
}
