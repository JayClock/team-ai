import { Collection, Entity } from '@hateoas-ts/resource';

export type TaskRunKind = 'implement' | 'review' | 'verify';

export type TaskRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type TaskRun = Entity<
  {
    id: string;
    projectId: string;
    taskId: string;
    isLatest: boolean;
    sessionId: string | null;
    kind: TaskRunKind;
    delegationGroupId?: string | null;
    waveId?: string | null;
    parentTaskId?: string | null;
    role: string | null;
    provider: string | null;
    specialistId: string | null;
    status: TaskRunStatus;
    summary: string | null;
    verificationVerdict: string | null;
    verificationReport: string | null;
    retryOfRunId: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: TaskRun;
    collection: TaskRunCollection;
    project: never;
    retry: never;
    'retry-action'?: TaskRun;
    session: never;
    task: never;
  }
>;

export type TaskRunCollection = Entity<
  Collection<TaskRun>['data'],
  Collection<TaskRun>['links']
>;
