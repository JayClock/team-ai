import { Collection, Entity } from '@hateoas-ts/resource';

export type AgentEventType =
  | 'AGENT_CREATED'
  | 'AGENT_ACTIVATED'
  | 'AGENT_COMPLETED'
  | 'AGENT_ERROR'
  | 'TASK_ASSIGNED'
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  | 'TASK_STATUS_CHANGED'
  | 'MESSAGE_SENT'
  | 'REPORT_SUBMITTED';

export type AgentEvent = Entity<
  {
    id: string;
    type: AgentEventType;
    agent: { id: string } | null;
    task: { id: string } | null;
    message: string | null;
    occurredAt: string;
    project: { id: string };
  },
  {
    self: AgentEvent;
    collection: Collection<AgentEvent>;
  }
>;

export type AgentEventCollection = Entity<
  Collection<AgentEvent>['data'],
  Collection<AgentEvent>['links'] & {
    'create-event': AgentEvent;
  }
>;
