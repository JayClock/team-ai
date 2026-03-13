export type TaskRunKind = 'implement' | 'review' | 'verify';

export type TaskRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type TaskRunStartStatus = 'PENDING' | 'RUNNING';

export interface TaskRunPayload {
  completedAt: string | null;
  createdAt: string;
  id: string;
  kind: TaskRunKind;
  projectId: string;
  provider: string | null;
  retryOfRunId: string | null;
  role: string | null;
  sessionId: string | null;
  specialistId: string | null;
  startedAt: string | null;
  status: TaskRunStatus;
  summary: string | null;
  taskId: string;
  updatedAt: string;
  verificationReport: string | null;
  verificationVerdict: string | null;
}

export interface TaskRunListPayload {
  items: TaskRunPayload[];
  page: number;
  pageSize: number;
  projectId: string;
  sessionId?: string;
  status?: TaskRunStatus;
  taskId?: string;
  total: number;
}

export interface CreateTaskRunInput {
  kind?: TaskRunKind;
  projectId: string;
  provider?: string | null;
  retryOfRunId?: string | null;
  role?: string | null;
  sessionId?: string | null;
  specialistId?: string | null;
  startedAt?: string | null;
  status?: TaskRunStatus;
  summary?: string | null;
  taskId: string;
  verificationReport?: string | null;
  verificationVerdict?: string | null;
}

export interface StartTaskRunInput extends Omit<CreateTaskRunInput, 'status'> {
  status?: TaskRunStartStatus;
}

export interface ResolveTaskRunInput {
  completedAt?: string | null;
  provider?: string | null;
  role?: string | null;
  sessionId?: string | null;
  specialistId?: string | null;
  startedAt?: string | null;
  summary?: string | null;
  verificationReport?: string | null;
  verificationVerdict?: string | null;
}

export type CompleteTaskRunInput = ResolveTaskRunInput

export type FailTaskRunInput = ResolveTaskRunInput

export type CancelTaskRunInput = ResolveTaskRunInput

export interface UpdateTaskRunInput {
  completedAt?: string | null;
  provider?: string | null;
  retryOfRunId?: string | null;
  role?: string | null;
  sessionId?: string | null;
  specialistId?: string | null;
  startedAt?: string | null;
  status?: TaskRunStatus;
  summary?: string | null;
  verificationReport?: string | null;
  verificationVerdict?: string | null;
}
