import { ProblemError, problemTypeToCode } from './errors/problem-error.js';

export interface DiagnosticLogger {
  debug?(payload: unknown, message?: string): void;
  error?(payload: unknown, message?: string): void;
  info?(payload: unknown, message?: string): void;
  warn?(payload: unknown, message?: string): void;
}

type DiagnosticLogLevel = 'debug' | 'error' | 'info' | 'warn';

interface DiagnosticErrorShape {
  errorCode: string;
  errorContext?: Record<string, unknown>;
  errorMessage: string;
  problemStatus?: number;
  problemTitle?: string;
  problemType?: string;
}

function normalizeDiagnosticCode(value: string | undefined, fallback: string) {
  const normalized = value
    ?.trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase();

  return normalized && normalized.length > 0 ? normalized : fallback;
}

export function getErrorDiagnostics(
  error: unknown,
  fallbackCode = 'UNEXPECTED_ERROR',
): DiagnosticErrorShape {
  if (error instanceof ProblemError) {
    return {
      errorCode: normalizeDiagnosticCode(
        error.code,
        problemTypeToCode(error.type, fallbackCode),
      ),
      errorContext: error.context,
      errorMessage: error.message,
      problemStatus: error.status,
      problemTitle: error.title,
      problemType: error.type,
    };
  }

  if (error instanceof Error) {
    return {
      errorCode: normalizeDiagnosticCode(
        (error as { code?: string }).code,
        fallbackCode,
      ),
      errorMessage: error.message,
    };
  }

  return {
    errorCode: fallbackCode,
    errorMessage: 'Unexpected error',
  };
}

export function logDiagnostic(
  logger: DiagnosticLogger | undefined,
  level: DiagnosticLogLevel,
  payload: Record<string, unknown>,
  message: string,
) {
  logger?.[level]?.(payload, message);
}
