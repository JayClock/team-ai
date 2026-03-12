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

export type AcpEventTypePayload =
  | 'status'
  | 'message'
  | 'tool_call'
  | 'tool_result'
  | 'plan'
  | 'session'
  | 'mode'
  | 'config'
  | 'usage'
  | 'complete'
  | 'error';

export interface AcpEventEnvelopePayload {
  data: Record<string, unknown>;
  emittedAt: string;
  error: AcpEventErrorPayload | null;
  eventId: string;
  sessionId: string;
  type: AcpEventTypePayload;
}

export interface AcpSessionPayload {
  agent: AcpRefPayload | null;
  actor: AcpRefPayload;
  completedAt: string | null;
  cwd: string;
  failureReason: string | null;
  id: string;
  lastActivityAt: string | null;
  lastEventId: AcpRefPayload | null;
  name: string | null;
  parentSession: AcpRefPayload | null;
  project: AcpRefPayload;
  provider: string;
  specialistId: string | null;
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
