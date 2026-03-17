export type WorkflowTriggerSource = 'manual' | 'schedule' | 'webhook';
export type WorkflowRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface WorkflowStepPayload {
  name: string;
  parallelGroup: string | null;
  prompt: string;
  specialistId: string;
}

export interface WorkflowRunStepPayload {
  completedAt: string | null;
  errorMessage: string | null;
  name: string;
  parallelGroup: string | null;
  resultSessionId: string | null;
  startedAt: string | null;
  status: string;
  taskId: string | null;
  taskOutput: string | null;
  specialistId: string;
}

export interface WorkflowDefinitionPayload {
  createdAt: string;
  description: string | null;
  id: string;
  name: string;
  projectId: string;
  steps: WorkflowStepPayload[];
  updatedAt: string;
  version: number;
}

export interface WorkflowRunPayload {
  completedAt: string | null;
  completedSteps: number;
  createdAt: string;
  currentStepName: string | null;
  failedSteps: number;
  id: string;
  pendingSteps: number;
  projectId: string;
  runningSteps: number;
  steps: WorkflowRunStepPayload[];
  startedAt: string | null;
  status: WorkflowRunStatus;
  totalSteps: number;
  triggerPayload: string | null;
  triggerSource: WorkflowTriggerSource;
  updatedAt: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
}

export interface WorkflowListPayload {
  items: WorkflowDefinitionPayload[];
  projectId: string;
}

export interface WorkflowRunListPayload {
  items: WorkflowRunPayload[];
  workflowId: string;
}

export interface CreateWorkflowInput {
  description?: string | null;
  name: string;
  projectId: string;
  steps: WorkflowStepPayload[];
  version?: number;
}

export interface TriggerWorkflowInput {
  triggerPayload?: string | null;
  triggerSource?: WorkflowTriggerSource;
}
