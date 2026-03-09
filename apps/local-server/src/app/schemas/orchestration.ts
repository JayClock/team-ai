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

export interface OrchestrationArtifactPayload {
  content: Record<string, unknown>;
  createdAt: string;
  id: string;
  kind: string;
  sessionId: string;
  stepId: string;
  updatedAt: string;
}

export interface OrchestrationSessionPayload {
  createdAt: string;
  currentPhase?: StepKind | null;
  executionMode: string;
  goal: string;
  id: string;
  lastEventAt?: string | null;
  provider: string;
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
  traceId?: string;
  updatedAt: string;
  workspaceRoot?: string | null;
}

export interface OrchestrationSessionListPayload {
  items: OrchestrationSessionPayload[];
  page: number;
  pageSize: number;
  total: number;
}

export interface OrchestrationStepPayload {
  attempt: number;
  artifacts: OrchestrationArtifactPayload[];
  completedAt?: string | null;
  createdAt: string;
  dependsOn: string[];
  errorCode?: string | null;
  errorMessage?: string | null;
  id: string;
  input?: Record<string, unknown> | null;
  kind: StepKind;
  maxAttempts: number;
  output?: Record<string, unknown> | null;
  role?: string | null;
  runtimeCursor?: string | null;
  runtimeSessionId?: string | null;
  sessionId: string;
  startedAt?: string | null;
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
    | 'session.running'
    | 'session.cancelled'
    | 'session.completed'
    | 'session.failed'
    | 'session.resumed'
    | 'session.retried'
    | 'step.ready'
    | 'step.started'
    | 'step.runtime.event'
    | 'step.cancelled'
    | 'step.completed'
    | 'step.failed'
    | 'step.retried';
}
