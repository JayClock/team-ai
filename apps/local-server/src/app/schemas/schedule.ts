export type ScheduleTriggerTarget = 'workflow';

export interface SchedulePayload {
  createdAt: string;
  cronExpr: string;
  enabled: boolean;
  id: string;
  lastRunAt: string | null;
  lastWorkflowRunId: string | null;
  name: string;
  nextRunAt: string | null;
  projectId: string;
  triggerPayloadTemplate: string | null;
  triggerTarget: ScheduleTriggerTarget;
  updatedAt: string;
  workflowId: string;
}

export interface ScheduleListPayload {
  items: SchedulePayload[];
  projectId: string;
}

export interface CreateScheduleInput {
  cronExpr: string;
  enabled?: boolean;
  name: string;
  projectId: string;
  triggerPayloadTemplate?: string | null;
  workflowId: string;
}

export interface TickSchedulesResult {
  firedScheduleIds: string[];
  workflowRunIds: string[];
}
