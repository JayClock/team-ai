export type ProjectOrchestrationMode = 'ROUTA' | 'DEVELOPER';

export interface ProjectRuntimeProfilePayload {
  createdAt: string;
  defaultModel: string | null;
  defaultProviderId: string | null;
  enabledMcpServerIds: string[];
  enabledSkillIds: string[];
  id: string;
  orchestrationMode: ProjectOrchestrationMode;
  projectId: string;
  updatedAt: string;
}

export interface UpdateProjectRuntimeProfileInput {
  defaultModel?: string | null;
  defaultProviderId?: string | null;
  enabledMcpServerIds?: string[];
  enabledSkillIds?: string[];
  orchestrationMode?: ProjectOrchestrationMode;
}
