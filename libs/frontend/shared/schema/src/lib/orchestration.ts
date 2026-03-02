import { Entity } from '@hateoas-ts/resource';
import { Agent } from './agent.js';
import { Task } from './task.js';

export type Orchestration = Entity<
  {
    goal: string;
    state: 'STARTED';
    coordinator: { id: string };
    implementer: { id: string };
    task: { id: string };
  },
  {
    self: Task;
    tasks: Task;
    agents: Agent;
  }
>;
