export type SessionStatus =
  | 'PENDING'
  | 'PLANNING'
  | 'RUNNING'
  | 'PAUSED'
  | 'FAILED'
  | 'COMPLETED'
  | 'CANCELLED';

export type StepStatus =
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'WAITING_RETRY'
  | 'FAILED'
  | 'COMPLETED'
  | 'CANCELLED';

export type StepKind = 'PLAN' | 'IMPLEMENT' | 'VERIFY';

export interface OrchestrationSessionPayload {
  createdAt: string;
  goal: string;
  id: string;
  projectId: string;
  status: SessionStatus;
  strategy: {
    failFast: boolean;
    maxParallelism: number;
    mode: string;
  };
  stepCounts: {
    completed: number;
    failed: number;
    running: number;
    total: number;
  };
  title: string;
  updatedAt: string;
}

export interface OrchestrationSessionListPayload {
  items: OrchestrationSessionPayload[];
  page: number;
  pageSize: number;
  total: number;
}

export interface OrchestrationStepPayload {
  attempt: number;
  createdAt: string;
  dependsOn: string[];
  id: string;
  kind: StepKind;
  maxAttempts: number;
  sessionId: string;
  status: StepStatus;
  title: string;
  updatedAt: string;
}

export interface OrchestrationEventPayload {
  at: string;
  id: string;
  payload: Record<string, unknown>;
  sessionId: string;
  stepId?: string;
  type:
    | 'session.created'
    | 'session.cancelled'
    | 'session.resumed'
    | 'session.retried'
    | 'step.retried';
}
