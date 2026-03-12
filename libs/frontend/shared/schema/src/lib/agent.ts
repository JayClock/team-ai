import { Collection, Entity } from '@hateoas-ts/resource';

export type AgentRole = 'ROUTA' | 'CRAFTER' | 'GATE' | 'DEVELOPER';

export type Agent = Entity<
  {
    id: string;
    name: string;
    role: AgentRole | (string & {});
    provider: string;
    model: string;
    parentAgentId: string | null;
    specialistId: string | null;
    systemPrompt: string | null;
    projectId: string;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: Agent;
    collection: AgentCollection;
  }
>;

export type AgentCollection = Entity<
  Collection<Agent>['data'],
  Collection<Agent>['links']
>;
