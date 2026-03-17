export type BackgroundTaskPriority = 'HIGH' | 'LOW' | 'NORMAL';
export type BackgroundTaskStatus =
  | 'CANCELLED'
  | 'COMPLETED'
  | 'FAILED'
  | 'PENDING'
  | 'RUNNING';
export type BackgroundTaskTriggerSource =
  | 'fleet'
  | 'manual'
  | 'polling'
  | 'schedule'
  | 'webhook'
  | 'workflow';

export interface BackgroundTaskPayload {
  agentId: string;
  attempts: number;
  completedAt: string | null;
  createdAt: string;
  currentActivity: string | null;
  dependsOnTaskIds: string[];
  errorMessage: string | null;
  id: string;
  inputTokens: number | null;
  lastActivityAt: string | null;
  maxAttempts: number;
  outputTokens: number | null;
  priority: BackgroundTaskPriority;
  projectId: string;
  prompt: string;
  resultSessionId: string | null;
  startedAt: string | null;
  status: BackgroundTaskStatus;
  taskId: string | null;
  taskOutput: string | null;
  title: string;
  toolCallCount: number | null;
  triggerSource: BackgroundTaskTriggerSource;
  triggeredBy: string;
  updatedAt: string;
  workflowRunId: string | null;
  workflowStepName: string | null;
}

export interface BackgroundTaskListPayload {
  items: BackgroundTaskPayload[];
  page: number;
  pageSize: number;
  projectId: string;
  status?: BackgroundTaskStatus;
  total: number;
}

export interface CreateBackgroundTaskInput {
  agentId: string;
  maxAttempts?: number;
  priority?: BackgroundTaskPriority;
  projectId: string;
  prompt: string;
  taskId?: string | null;
  title?: string;
  triggerSource?: BackgroundTaskTriggerSource;
  triggeredBy?: string;
  workflowRunId?: string | null;
  workflowStepName?: string | null;
}
