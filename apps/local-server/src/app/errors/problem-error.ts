export interface ProblemDetails {
  code?: string;
  context?: Record<string, unknown>;
  detail: string;
  instance?: string;
  status: number;
  title: string;
  type: string;
}

function normalizeProblemCode(
  value: string | undefined,
  fallback: string,
): string {
  const normalized = value
    ?.trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase();

  return normalized && normalized.length > 0 ? normalized : fallback;
}

export function problemTypeToCode(type: string, fallback = 'REQUEST_ERROR') {
  if (type === 'about:blank') {
    return fallback;
  }

  const segment = type.split('/').at(-1);
  return normalizeProblemCode(segment, fallback);
}

export class ProblemError extends Error {
  readonly code: string;

  readonly context?: Record<string, unknown>;

  readonly type: string;

  readonly title: string;

  readonly status: number;

  constructor(problem: ProblemDetails) {
    super(problem.detail);
    this.name = 'ProblemError';
    this.code = normalizeProblemCode(
      problem.code,
      problemTypeToCode(
        problem.type,
        problem.status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
      ),
    );
    this.context = problem.context;
    this.type = problem.type;
    this.title = problem.title;
    this.status = problem.status;
  }
}

export function isProblemError(error: unknown): error is ProblemError {
  return error instanceof ProblemError;
}
