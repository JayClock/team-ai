import type {
  AcpEventTypePayload,
  AcpEventUpdatePayload,
} from '@orchestration/runtime-acp';

export type TraceEventTypePayload = AcpEventTypePayload;

export interface TracePayload {
  createdAt: string;
  eventId: string;
  eventType: TraceEventTypePayload;
  id: string;
  model: string | null;
  payload: Record<string, unknown>;
  projectId: string;
  provider: string;
  sessionId: string;
  sourceTraceId: string | null;
  summary: string;
}

export interface TraceListPayload {
  eventType: TraceEventTypePayload | null;
  items: TracePayload[];
  limit: number;
  offset: number;
  projectId: string | null;
  sessionId: string | null;
  total: number;
}

export interface TraceStatsPayload {
  byEventType: Record<string, number>;
  projectId: string | null;
  sessionId: string | null;
  total: number;
  uniqueSessions: number;
}

export interface RecordAcpTraceInput {
  createdAt: string;
  eventId: string;
  sessionId: string;
  update: AcpEventUpdatePayload;
}

export interface ListTracesInput {
  eventType?: TraceEventTypePayload;
  limit?: number;
  offset?: number;
  projectId?: string;
  sessionId?: string;
}
