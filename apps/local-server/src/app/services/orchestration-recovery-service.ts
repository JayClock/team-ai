import type { SessionStatus, StepStatus } from '../schemas/orchestration';

export function getCancelableStepStatuses(): StepStatus[] {
  return ['PENDING', 'READY', 'RUNNING', 'WAITING_RETRY'];
}

export function getRetryableStepStatuses(): StepStatus[] {
  return ['FAILED', 'WAITING_RETRY'];
}

export function getRecoverableSessionStatuses(): SessionStatus[] {
  return ['PENDING', 'PLANNING', 'RUNNING'];
}

export function isRetryableStepStatus(status: StepStatus): boolean {
  return getRetryableStepStatuses().includes(status);
}

export function shouldFailSessionForWaitingRetry(statuses: StepStatus[]): boolean {
  return statuses.includes('WAITING_RETRY');
}
