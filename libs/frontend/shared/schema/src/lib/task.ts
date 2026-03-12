import { Collection, Entity } from '@hateoas-ts/resource';
import type { AgentRole } from './agent.js';
import type { TaskRunCollection } from './task-run.js';

export type TaskKind = 'plan' | 'implement' | 'review' | 'verify';

export type TaskSourceType = 'manual' | 'acp_plan';

export type TaskStatus =
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'FAILED'
  | 'CANCELLED'
  | (string & {});

export type VerificationVerdict =
  | 'pending'
  | 'pass'
  | 'fail'
  | 'blocked'
  | (string & {});

export type Task = Entity<
  {
    id: string;
    title: string;
    objective: string;
    scope: string | null;
    status: TaskStatus;
    sourceEventId: string | null;
    sourceEntryIndex: number | null;
    sourceType: TaskSourceType;
    kind: TaskKind | null;
    boardId: string | null;
    columnId: string | null;
    position: number | null;
    priority: string | null;
    labels: string[];
    assignee: string | null;
    assignedProvider: string | null;
    assignedRole: AgentRole | (string & {}) | null;
    assignedSpecialistId: string | null;
    assignedSpecialistName: string | null;
    dependencies: string[];
    parallelGroup: string | null;
    acceptanceCriteria: string[];
    verificationCommands: string[];
    completionSummary: string | null;
    verificationVerdict: VerificationVerdict | null;
    verificationReport: string | null;
    triggerSessionId: string | null;
    parentTaskId: string | null;
    executionSessionId: string | null;
    resultSessionId: string | null;
    githubId: string | null;
    githubNumber: number | null;
    githubUrl: string | null;
    githubRepo: string | null;
    githubState: string | null;
    githubSyncedAt: string | null;
    lastSyncError: string | null;
    projectId: string;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: Task;
    collection: TaskCollection;
    runs: TaskRunCollection;
  }
>;

export type TaskCollection = Entity<
  Collection<Task>['data'],
  Collection<Task>['links']
>;
