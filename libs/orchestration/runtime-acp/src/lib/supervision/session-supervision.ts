import { ProblemError } from '../errors/problem-error.js';
import type { AcpTimeoutScopePayload } from '../schemas/acp.js';

export const DEFAULT_PROMPT_CANCEL_GRACE_MS = 1_000;
export const DEFAULT_PROMPT_COMPLETION_GRACE_MS = 1_000;
export const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_PROVIDER_INIT_TIMEOUT_MS = 10_000;
export const DEFAULT_PACKAGE_MANAGER_INIT_TIMEOUT_MS = 120_000;

export function resolvePromptTransportTimeoutMs(input: {
  cancelGraceMs?: number;
  minimumTransportMs?: number;
  promptTimeoutMs: number;
}): number {
  return Math.max(
    input.promptTimeoutMs + (input.cancelGraceMs ?? DEFAULT_PROMPT_CANCEL_GRACE_MS),
    input.minimumTransportMs ?? DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
  );
}

export function resolvePromptCompletionWaitTimeoutMs(input: {
  completionGraceMs?: number;
  promptTimeoutMs?: number;
}): number | undefined {
  if (!input.promptTimeoutMs || input.promptTimeoutMs <= 0) {
    return undefined;
  }

  return input.promptTimeoutMs + (input.completionGraceMs ?? DEFAULT_PROMPT_COMPLETION_GRACE_MS);
}

export function createTimeoutProblem(input: {
  detail: string;
  scope: AcpTimeoutScopePayload;
  status?: number;
  title: string;
  type: string;
  timeoutMs: number;
}): ProblemError {
  return new ProblemError({
    type: input.type,
    title: input.title,
    status: input.status ?? 504,
    detail: input.detail,
    context: {
      timeoutMs: input.timeoutMs,
      timeoutScope: input.scope,
    },
  });
}
