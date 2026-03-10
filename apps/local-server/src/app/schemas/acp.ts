export type AcpSessionState =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface AcpRefPayload {
  id: string;
}

export interface AcpEventErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs: number;
}

export interface AcpEventEnvelopePayload {
  data: Record<string, unknown>;
  emittedAt: string;
  error: AcpEventErrorPayload | null;
  eventId: string;
  sessionId: string;
  type: string;
}

export interface AcpSessionPayload {
  actor: AcpRefPayload;
  completedAt: string | null;
  failureReason: string | null;
  id: string;
  lastActivityAt: string | null;
  lastEventId: AcpRefPayload | null;
  mode: string;
  name: string | null;
  parentSession: AcpRefPayload | null;
  project: AcpRefPayload;
  provider: string;
  startedAt: string | null;
  state: AcpSessionState;
}

export interface AcpSessionListPayload {
  items: AcpSessionPayload[];
  page: number;
  pageSize: number;
  projectId: string;
  total: number;
}
