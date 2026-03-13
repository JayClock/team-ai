export type ProjectOrchestrationMode = 'ROUTA' | 'DEVELOPER';

export type ProjectRuntimeProfileConfig = Record<string, unknown>;
export type ProjectRuntimeProfileConfigMap = Record<
  string,
  ProjectRuntimeProfileConfig
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
  skillConfigs?: ProjectRuntimeProfileConfigMap;
}
