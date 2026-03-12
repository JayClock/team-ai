import { Entity } from '@hateoas-ts/resource';

export type ProjectOrchestrationMode = 'ROUTA' | 'DEVELOPER';

export type ProjectRuntimeProfile = Entity<
  {
    id: string;
    projectId: string;
    defaultProviderId: string | null;
    defaultModel: string | null;
    orchestrationMode: ProjectOrchestrationMode;
    enabledSkillIds: string[];
    enabledMcpServerIds: string[];
    createdAt: string;
    updatedAt: string;
  },
  {
    self: ProjectRuntimeProfile;
    project: never;
    root: never;
  }
>;
