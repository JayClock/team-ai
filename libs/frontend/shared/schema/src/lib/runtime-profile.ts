import { Entity } from '@hateoas-ts/resource';
import type { RoleValue } from './role.js';

export type ProjectOrchestrationMode = 'ROUTA' | 'DEVELOPER';
export type ProjectRuntimeProfileConfig = Record<string, unknown>;
export type ProjectRuntimeProfileConfigMap = Record<
  string,
  ProjectRuntimeProfileConfig
>;
export type ProjectRuntimeRoleDefault = {
  model: string | null;
  providerId: string | null;
};
export type ProjectRuntimeRoleDefaults = Partial<
  Record<RoleValue, ProjectRuntimeRoleDefault>
>;

export type ProjectRuntimeProfile = Entity<
  {
    id: string;
    projectId: string;
    defaultProviderId: string | null;
    defaultModel: string | null;
    orchestrationMode: ProjectOrchestrationMode;
    roleDefaults: ProjectRuntimeRoleDefaults;
    enabledSkillIds: string[];
    enabledMcpServerIds: string[];
    skillConfigs: ProjectRuntimeProfileConfigMap;
    mcpServerConfigs: ProjectRuntimeProfileConfigMap;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: ProjectRuntimeProfile;
    project: never;
    root: never;
  }
>;
