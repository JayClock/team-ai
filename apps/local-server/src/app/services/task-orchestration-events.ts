import type { RoleValue } from '../schemas/role';
import type { TaskPayload } from '../schemas/task';
import type { AcpOrchestrationEventName } from '../schemas/acp';
import type {
  TaskSessionDispatchInput,
  TaskSessionDispatchOptions,
} from './task-session-dispatch-service';

export type TaskOrchestrationEventName =
  | 'task.dispatch.attempt'
  | 'task.dispatch.blocked'
  | 'task.dispatch.failed'
  | 'task.dispatch.provider_fallback'
  | 'task.dispatch.succeeded'
  | `task.orchestration.${AcpOrchestrationEventName}`;

export interface TaskOrchestrationEventContext {
  callerSessionId: string | null;
  projectId: string;
  resolvedProvider: string | null;
  resolvedRole: RoleValue | null;
  retryOfRunId: string | null;
  source: string;
  specialistId: string | null;
  taskExecutionSessionId: string | null;
  taskId: string;
  taskKind: TaskPayload['kind'];
  taskStatus: string;
  triggerReason: string | null;
  triggerSource: string | null;
}

export interface TaskOrchestrationEventPayload
  extends TaskOrchestrationEventContext {
  event: TaskOrchestrationEventName;
}

// Contract-level orchestration events that external diagnostics can rely on.
export const taskOrchestrationEventNames = {
  dispatchAttempt: 'task.dispatch.attempt',
  dispatchBlocked: 'task.dispatch.blocked',
  dispatchFailed: 'task.dispatch.failed',
  dispatchProviderFallback: 'task.dispatch.provider_fallback',
  dispatchSucceeded: 'task.dispatch.succeeded',
  childSessionCompleted: 'task.orchestration.child_session_completed',
  delegationGroupCompleted: 'task.orchestration.delegation_group_completed',
  gateRequired: 'task.orchestration.gate_required',
  parentSessionResumeRequested: 'task.orchestration.parent_session_resume_requested',
} as const;

export function buildTaskOrchestrationEventContext(
  task: Pick<
    TaskPayload,
    'executionSessionId' | 'id' | 'kind' | 'projectId' | 'status'
  >,
  input: Pick<TaskSessionDispatchInput, 'callerSessionId' | 'retryOfRunId'>,
  options: TaskSessionDispatchOptions,
  resolved: {
    provider?: string | null;
    role?: RoleValue | null;
    specialistId?: string | null;
  } = {},
): TaskOrchestrationEventContext {
  return {
    callerSessionId: input.callerSessionId ?? null,
    projectId: task.projectId,
    resolvedProvider: resolved.provider ?? null,
    resolvedRole: resolved.role ?? null,
    retryOfRunId: input.retryOfRunId ?? null,
    source: options.source ?? 'task-session-dispatch-service',
    specialistId: resolved.specialistId ?? null,
    taskExecutionSessionId: task.executionSessionId,
    taskId: task.id,
    taskKind: task.kind,
    taskStatus: task.status,
    triggerReason: options.triggerReason ?? null,
    triggerSource: options.triggerSource ?? null,
  };
}

export function createTaskOrchestrationEvent(
  event: TaskOrchestrationEventName,
  context: TaskOrchestrationEventContext,
  details: Record<string, unknown> = {},
): TaskOrchestrationEventPayload & Record<string, unknown> {
  return {
    event,
    ...context,
    ...details,
  };
}
