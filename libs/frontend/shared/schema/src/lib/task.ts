import { Collection, Entity } from '@hateoas-ts/resource';

export type TaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'REVIEW_REQUIRED'
  | 'COMPLETED'
  | 'NEEDS_FIX'
  | 'BLOCKED'
  | 'CANCELLED';

export type VerificationVerdict = 'APPROVED' | 'NOT_APPROVED' | 'BLOCKED';

export type Task = Entity<
  {
    id: string;
    title: string;
    objective: string;
    scope: string | null;
    acceptanceCriteria: string[] | null;
    verificationCommands: string[] | null;
    status: TaskStatus;
    assignedTo: { id: string } | null;
    delegatedBy: { id: string } | null;
    completionSummary: string | null;
    verificationVerdict: VerificationVerdict | null;
    verificationReport: string | null;
    project: { id: string };
  },
  {
    self: Task;
    collection: Collection<Task>;
  }
>;

export type TaskCollection = Entity<
  Collection<Task>['data'],
  Collection<Task>['links'] & {
    'create-task': Task;
  }
>;
