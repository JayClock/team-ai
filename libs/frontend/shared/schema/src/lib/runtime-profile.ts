import { Entity } from '@hateoas-ts/resource';

export type ProjectOrchestrationMode = 'ROUTA' | 'DEVELOPER';
export type ProjectRuntimeProfileConfig = Record<string, unknown>;
export type ProjectRuntimeProfileConfigMap = Record<
  string,
  ProjectRuntimeProfileConfig
>;

export type ProjectRuntimeProfile = Entity<
  {
    id: string;
    projectId: string;
    defaultProviderId: string | null;
    defaultModel: string | null;
    orchestrationMode: ProjectOrchestrationMode;
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
