import { Collection, Entity } from '@hateoas-ts/resource';
import { AgentCollection } from './agent.js';
import { AgentEventCollection } from './agent-event.js';
import { TaskCollection } from './task.js';

export type OrchestrationState =
  | 'PENDING'
  | 'RUNNING'
  | 'REVIEW_REQUIRED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type Orchestration = Entity<
  {
    id: string;
    goal: string;
    state: OrchestrationState;
    coordinator: { id: string };
    implementer: { id: string };
    task: { id: string };
    currentStep: { id: string } | null;
    startedAt: string | null;
    completedAt: string | null;
    failureReason: string | null;
  },
  {
    self: Orchestration;
    collection: Collection<Orchestration>;
    tasks: TaskCollection;
    events: AgentEventCollection;
    agents: AgentCollection;
    cancel?: Orchestration;
  }
>;
