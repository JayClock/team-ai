import { Collection, Entity } from '@hateoas-ts/resource';

export type AgentRole = 'ROUTA' | 'CRAFTER' | 'GATE' | 'DEVELOPER' | 'SPECIALIST';

export type AgentStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'ERROR'
  | 'CANCELLED';

export type Agent = Entity<
  {
    id: string;
    name: string;
    role: AgentRole;
    modelTier: string;
    status: AgentStatus;
    parent: { id: string } | null;
    prompt: string | null;
    project: { id: string };
  },
  {
    self: Agent;
    collection: Collection<Agent>;
  }
>;

export type AgentCollection = Entity<
  Collection<Agent>['data'],
  Collection<Agent>['links'] & {
    'create-agent': Agent;
  }
>;
