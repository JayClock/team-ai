import { Collection, Entity } from '@hateoas-ts/resource';
import type { AgentRole } from './agent.js';
import type { Codebase } from './codebase.js';
import type { AcpSession } from './session.js';
import type { TaskRunCollection } from './task-run.js';
import type { Worktree } from './worktree.js';

export type TaskKind = 'plan' | 'implement' | 'review' | 'verify';

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

export type TaskLaneSessionStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'transitioned'
  | (string & {});

export type TaskLaneHandoffRequestType =
  | 'environment_preparation'
  | 'runtime_context'
  | 'clarification'
  | 'rerun_command'
  | (string & {});

export type TaskLaneHandoffStatus =
  | 'requested'
  | 'delivered'
  | 'completed'
  | 'blocked'
  | 'failed'
  | (string & {});

export type TaskLaneSession = {
  columnId?: string;
  columnName?: string;
  completedAt?: string;
  provider?: string;
  role?: string;
  routaAgentId?: string;
  sessionId: string;
  specialistId?: string;
  specialistName?: string;
  startedAt: string;
  status: TaskLaneSessionStatus;
};

export type TaskLaneHandoff = {
  fromColumnId?: string;
  fromSessionId: string;
  id: string;
  request: string;
  requestType: TaskLaneHandoffRequestType;
  requestedAt: string;
  respondedAt?: string;
  responseSummary?: string;
  status: TaskLaneHandoffStatus;
  toColumnId?: string;
  toSessionId: string;
};

export type Task = Entity<
  {
    id: string;
    title: string;
    objective: string;
    scope: string | null;
    status: TaskStatus;
    kind: TaskKind | null;
    laneHandoffs: TaskLaneHandoff[];
    laneSessions: TaskLaneSession[];
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
    codebaseId: string | null;
    dependencies: string[];
    parallelGroup: string | null;
    acceptanceCriteria: string[];
    verificationCommands: string[];
    completionSummary: string | null;
    verificationVerdict: VerificationVerdict | null;
    verificationReport: string | null;
    parentTaskId: string | null;
    executionSessionId: string | null;
    resultSessionId: string | null;
    sessionId: string | null;
    triggerSessionId: string | null;
    sourceType: string | null;
    sourceEventId: string | null;
    sourceEntryIndex: number | null;
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
    worktreeId: string | null;
  },
  {
    self: Task;
    collection: TaskCollection;
    codebase?: Codebase;
    execute?: Task;
    execution?: AcpSession;
    result?: AcpSession;
    runs: TaskRunCollection;
    worktree?: Worktree;
  }
>;

export type TaskCollection = Entity<
  Collection<Task>['data'],
  Collection<Task>['links']
>;
