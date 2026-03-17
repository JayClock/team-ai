import type {
  TaskLaneHandoffPayload,
  TaskLaneHandoffRequestType,
  TaskLaneHandoffStatus,
  TaskLaneSessionPayload,
  TaskLaneSessionStatus,
  TaskPayload,
} from '../schemas/task';

function ensureLaneArrays(task: TaskPayload) {
  if (!task.laneSessions) {
    task.laneSessions = [];
  }

  if (!task.laneHandoffs) {
    task.laneHandoffs = [];
  }
}

export function upsertTaskLaneSession(
  task: TaskPayload,
  session: Omit<TaskLaneSessionPayload, 'startedAt' | 'status'> & {
    startedAt?: string;
    status?: TaskLaneSessionStatus;
  },
): TaskLaneSessionPayload {
  ensureLaneArrays(task);

  const existing = task.laneSessions.find(
    (entry) => entry.sessionId === session.sessionId,
  );
  if (existing) {
    Object.assign(existing, session);
    existing.startedAt = existing.startedAt || session.startedAt || new Date().toISOString();
    existing.status = existing.status || session.status || 'running';
    return existing;
  }

  const created: TaskLaneSessionPayload = {
    columnId: session.columnId,
    columnName: session.columnName,
    completedAt: session.completedAt,
    provider: session.provider,
    role: session.role,
    routaAgentId: session.routaAgentId,
    sessionId: session.sessionId,
    specialistId: session.specialistId,
    specialistName: session.specialistName,
    startedAt: session.startedAt ?? new Date().toISOString(),
    status: session.status ?? 'running',
  };

  task.laneSessions.push(created);
  return created;
}

export function markTaskLaneSessionStatus(
  task: TaskPayload,
  sessionId: string | undefined,
  status: TaskLaneSessionStatus,
): TaskLaneSessionPayload | undefined {
  if (!sessionId) {
    return undefined;
  }

  ensureLaneArrays(task);
  const entry = task.laneSessions.find((item) => item.sessionId === sessionId);
  if (!entry) {
    return undefined;
  }

  entry.status = status;
  if (status !== 'running') {
    entry.completedAt = new Date().toISOString();
  }

  return entry;
}

export function createTaskLaneHandoff(params: {
  fromColumnId?: string;
  fromSessionId: string;
  id: string;
  request: string;
  requestType: TaskLaneHandoffRequestType;
  status?: TaskLaneHandoffStatus;
  toColumnId?: string;
  toSessionId: string;
}): TaskLaneHandoffPayload {
  return {
    fromColumnId: params.fromColumnId,
    fromSessionId: params.fromSessionId,
    id: params.id,
    request: params.request,
    requestType: params.requestType,
    requestedAt: new Date().toISOString(),
    status: params.status ?? 'requested',
    toColumnId: params.toColumnId,
    toSessionId: params.toSessionId,
  };
}

export function upsertTaskLaneHandoff(
  task: TaskPayload,
  handoff: TaskLaneHandoffPayload,
): TaskLaneHandoffPayload {
  ensureLaneArrays(task);

  const existing = task.laneHandoffs.find((entry) => entry.id === handoff.id);
  if (existing) {
    Object.assign(existing, handoff);
    return existing;
  }

  task.laneHandoffs.push(handoff);
  return handoff;
}
