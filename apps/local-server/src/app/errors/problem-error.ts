export interface ProblemDetails {
  detail: string;
  instance?: string;
  status: number;
  title: string;
  type: string;
}

export class ProblemError extends Error {
  readonly type: string;

  readonly title: string;

  readonly status: number;

  constructor(problem: ProblemDetails) {
    super(problem.detail);
    this.name = 'ProblemError';
    this.type = problem.type;
    this.title = problem.title;
    this.status = problem.status;
  }
}

export function isProblemError(error: unknown): error is ProblemError {
  return error instanceof ProblemError;
}
