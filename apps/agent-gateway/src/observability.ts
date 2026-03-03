import { randomUUID } from 'node:crypto';

export type ErrorCategory = 'protocol' | 'runtime' | 'provider' | 'unknown';

type PromptRun = {
  startedAtMs: number;
  firstTokenRecorded: boolean;
};

type LatencyAggregate = {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
};

export type GatewayMetricsSnapshot = {
  generatedAt: string;
  sessions: {
    createAttempts: number;
    createSucceeded: number;
    createSuccessRate: number;
  };
  prompts: {
    attempts: number;
    completed: number;
    failed: number;
    completionRate: number;
    firstTokenLatencyMs: {
      count: number;
      avg: number;
      min: number;
      max: number;
    };
  };
  errors: {
    total: number;
    byCategory: Record<ErrorCategory, number>;
    byCode: Record<string, number>;
  };
};

export class GatewayMetrics {
  private sessionCreateAttempts = 0;
  private sessionCreateSucceededTotal = 0;

  private promptAttempts = 0;
  private promptCompleted = 0;
  private promptFailed = 0;
  private readonly promptRuns = new Map<string, PromptRun>();

  private readonly firstTokenLatency: LatencyAggregate = {
    count: 0,
    totalMs: 0,
    minMs: Number.POSITIVE_INFINITY,
    maxMs: 0,
  };

  private readonly errorsByCategory: Record<ErrorCategory, number> = {
    protocol: 0,
    runtime: 0,
    provider: 0,
    unknown: 0,
  };
  private readonly errorsByCode = new Map<string, number>();

  sessionCreateStarted(): void {
    this.sessionCreateAttempts += 1;
  }

  sessionCreateSucceeded(): void {
    this.sessionCreateSucceededTotal += 1;
  }

  promptStarted(sessionId: string): void {
    this.promptAttempts += 1;
    this.promptRuns.set(sessionId, {
      startedAtMs: Date.now(),
      firstTokenRecorded: false,
    });
  }

  firstToken(sessionId: string): void {
    const run = this.promptRuns.get(sessionId);
    if (!run || run.firstTokenRecorded) {
      return;
    }
    run.firstTokenRecorded = true;
    const latencyMs = Math.max(0, Date.now() - run.startedAtMs);
    this.firstTokenLatency.count += 1;
    this.firstTokenLatency.totalMs += latencyMs;
    this.firstTokenLatency.minMs = Math.min(this.firstTokenLatency.minMs, latencyMs);
    this.firstTokenLatency.maxMs = Math.max(this.firstTokenLatency.maxMs, latencyMs);
  }

  promptCompletedNow(sessionId: string): void {
    if (!this.promptRuns.has(sessionId)) {
      return;
    }
    this.promptCompleted += 1;
    this.promptRuns.delete(sessionId);
  }

  promptFailedNow(sessionId: string, code: string): void {
    if (!this.promptRuns.has(sessionId)) {
      return;
    }
    this.promptFailed += 1;
    this.promptRuns.delete(sessionId);
    this.recordError(code);
  }

  recordError(code: string, category?: ErrorCategory): void {
    const normalizedCode = normalizeCode(code);
    const resolvedCategory = category ?? classifyErrorCode(normalizedCode);
    this.errorsByCategory[resolvedCategory] += 1;
    this.errorsByCode.set(normalizedCode, (this.errorsByCode.get(normalizedCode) ?? 0) + 1);
  }

  snapshot(): GatewayMetricsSnapshot {
    const firstTokenCount = this.firstTokenLatency.count;
    const firstTokenMin =
      firstTokenCount === 0 ? 0 : Math.max(0, Math.round(this.firstTokenLatency.minMs));
    const firstTokenMax =
      firstTokenCount === 0 ? 0 : Math.max(0, Math.round(this.firstTokenLatency.maxMs));
    const firstTokenAvg =
      firstTokenCount === 0
          ? 0
          : Math.max(0, Math.round(this.firstTokenLatency.totalMs / firstTokenCount));
    const errorTotal =
      this.errorsByCategory.protocol
      + this.errorsByCategory.runtime
      + this.errorsByCategory.provider
      + this.errorsByCategory.unknown;

    return {
      generatedAt: new Date().toISOString(),
      sessions: {
        createAttempts: this.sessionCreateAttempts,
        createSucceeded: this.sessionCreateSucceededTotal,
        createSuccessRate: ratio(this.sessionCreateSucceededTotal, this.sessionCreateAttempts),
      },
      prompts: {
        attempts: this.promptAttempts,
        completed: this.promptCompleted,
        failed: this.promptFailed,
        completionRate: ratio(this.promptCompleted, this.promptAttempts),
        firstTokenLatencyMs: {
          count: firstTokenCount,
          avg: firstTokenAvg,
          min: firstTokenMin,
          max: firstTokenMax,
        },
      },
      errors: {
        total: errorTotal,
        byCategory: {
          protocol: this.errorsByCategory.protocol,
          runtime: this.errorsByCategory.runtime,
          provider: this.errorsByCategory.provider,
          unknown: this.errorsByCategory.unknown,
        },
        byCode: Object.fromEntries([...this.errorsByCode.entries()].sort(([a], [b]) => a.localeCompare(b))),
      },
    };
  }
}

export function resolveTraceId(
  traceIdFromHeader: string | undefined,
  traceIdFromBody: string | undefined
): string {
  const header = normalizeTraceId(traceIdFromHeader);
  if (header) {
    return header;
  }
  const body = normalizeTraceId(traceIdFromBody);
  if (body) {
    return body;
  }
  return randomUUID();
}

export function classifyErrorCode(code: string | undefined): ErrorCategory {
  const normalized = normalizeCode(code);
  if (normalized.startsWith('PROVIDER_')) {
    return 'provider';
  }
  if (
    normalized.startsWith('INVALID_')
    || normalized.startsWith('PROTOCOL_')
    || normalized === 'SESSION_NOT_FOUND'
    || normalized === 'NOT_FOUND'
  ) {
    return 'protocol';
  }
  if (
    normalized.startsWith('RUNTIME_')
    || normalized.startsWith('SESSION_STATE_')
    || normalized === 'INTERNAL_ERROR'
  ) {
    return 'runtime';
  }
  return 'unknown';
}

function normalizeCode(code: string | undefined): string {
  if (!code || code.trim().length === 0) {
    return 'UNKNOWN_ERROR';
  }
  return code.trim().toUpperCase();
}

function normalizeTraceId(traceId: string | undefined): string | null {
  if (!traceId || traceId.trim().length === 0) {
    return null;
  }
  return traceId.trim();
}

function ratio(success: number, attempts: number): number {
  if (attempts <= 0) {
    return 0;
  }
  return Number((success / attempts).toFixed(4));
}
