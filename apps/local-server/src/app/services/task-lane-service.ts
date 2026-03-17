import { customAlphabet } from 'nanoid';
import type {
  TaskLaneHandoffPayload,
  TaskLaneHandoffRequestType,
  TaskLaneHandoffStatus,
  TaskLaneSessionPayload,
  TaskLaneSessionStatus,
  TaskPayload,
} from '../schemas/task';

const handoffIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  10,
);

function ensureLaneArrays(
  task: Pick<TaskPayload, 'laneHandoffs' | 'laneSessions'>,
) {
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
    existing.startedAt =
      existing.startedAt || session.startedAt || new Date().toISOString();
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
  task: Pick<TaskPayload, 'laneHandoffs' | 'laneSessions'>,
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

export function archiveActiveTaskSession(
  task: Pick<TaskPayload, 'sessionIds' | 'triggerSessionId'>,
): void {
  if (!task.triggerSessionId) {
    return;
  }

  if (!task.sessionIds.includes(task.triggerSessionId)) {
    task.sessionIds.push(task.triggerSessionId);
  }
}

export function prepareTaskForColumnTransition(
  task: Pick<
    TaskPayload,
    | 'boardId'
    | 'columnId'
    | 'laneHandoffs'
    | 'laneSessions'
    | 'lastSyncError'
    | 'sessionIds'
    | 'triggerSessionId'
  >,
  next: {
    boardId: string | null;
    columnId: string | null;
  },
): boolean {
  if (task.boardId === next.boardId && task.columnId === next.columnId) {
    return false;
  }

  archiveActiveTaskSession(task);
  markTaskLaneSessionStatus(
    task,
    task.triggerSessionId ?? undefined,
    'transitioned',
  );
  task.triggerSessionId = null;
  task.lastSyncError = null;
  return true;
}

export function createTaskLaneHandoff(params: {
  artifactHints?: string[];
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
    artifactEvidence: [],
    artifactHints: params.artifactHints ?? [],
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

export function createTaskLaneHandoffId() {
  return `handoff_${handoffIdGenerator()}`;
}

export function getTaskLaneHandoff(
  task: Pick<TaskPayload, 'laneHandoffs'>,
  handoffId: string,
): TaskLaneHandoffPayload | null {
  return task.laneHandoffs.find((entry) => entry.id === handoffId) ?? null;
}

function formatHandoffRequestType(
  requestType: TaskLaneHandoffRequestType,
): string {
  switch (requestType) {
    case 'environment_preparation':
      return 'Environment preparation';
    case 'runtime_context':
      return 'Runtime context';
    case 'clarification':
      return 'Clarification';
    case 'rerun_command':
      return 'Rerun command';
    default:
      return requestType;
  }
}

export function buildPreviousLaneHandoffPrompt(params: {
  artifactHints?: string[];
  handoffId: string;
  request: string;
  requestType: TaskLaneHandoffRequestType;
  requestingColumnId?: string;
  requestingSessionId: string;
  task: Pick<TaskPayload, 'id' | 'title'>;
}) {
  return [
    `You have received a lane handoff request for task ${params.task.id}: ${params.task.title}.`,
    '',
    `Requesting lane: ${params.requestingColumnId ?? 'unknown'}`,
    `Request type: ${formatHandoffRequestType(params.requestType)}`,
    `Request: ${params.request}`,
    ...(params.artifactHints && params.artifactHints.length > 0
      ? [
          '',
          `Artifact expectations:\n${params.artifactHints.map((item) => `- ${item}`).join('\n')}`,
        ]
      : []),
    '',
    'Complete only the requested support work for this task.',
    'If runtime setup or environment preparation is needed, perform it in this session.',
    `When done or blocked, call submit_lane_handoff with taskId: "${params.task.id}", handoffId: "${params.handoffId}", and a concise summary.`,
    'Include artifacts when you have concrete evidence such as commands, URLs, screenshots, or generated files.',
    `This request originated from session ${params.requestingSessionId.slice(0, 8)}.`,
  ].join('\n');
}

export function buildLaneHandoffResponsePrompt(
  task: Pick<TaskPayload, 'id' | 'title'>,
  handoff: Pick<
    TaskLaneHandoffPayload,
    | 'request'
    | 'requestType'
    | 'responseSummary'
    | 'status'
    | 'artifactHints'
    | 'artifactEvidence'
  >,
) {
  return [
    `Lane handoff update for task ${task.id}: ${task.title}.`,
    '',
    `Request type: ${formatHandoffRequestType(handoff.requestType)}`,
    `Status: ${handoff.status}`,
    `Original request: ${handoff.request}`,
    ...(handoff.artifactHints && handoff.artifactHints.length > 0
      ? [`Expected artifacts: ${handoff.artifactHints.join(', ')}`]
      : []),
    handoff.responseSummary
      ? `Response: ${handoff.responseSummary}`
      : 'Response: no summary provided',
    ...(handoff.artifactEvidence && handoff.artifactEvidence.length > 0
      ? [
          `Artifacts:\n${handoff.artifactEvidence.map((item) => `- ${item}`).join('\n')}`,
        ]
      : []),
    '',
    'Continue your current lane work using this updated runtime context.',
  ].join('\n');
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

export function updateTaskLaneHandoff(
  task: TaskPayload,
  params: {
    artifactEvidence?: string[];
    handoffId: string;
    responseSummary: string;
    status: Exclude<TaskLaneHandoffStatus, 'requested'>;
  },
): TaskLaneHandoffPayload | null {
  ensureLaneArrays(task);

  const existing = getTaskLaneHandoff(task, params.handoffId);
  if (!existing) {
    return null;
  }

  existing.respondedAt = new Date().toISOString();
  existing.artifactEvidence = params.artifactEvidence ?? [];
  existing.responseSummary = params.responseSummary;
  existing.status = params.status;
  return existing;
}
