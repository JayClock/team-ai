export type TaskKind = 'plan' | 'implement' | 'review' | 'verify';
export type TaskLaneSessionStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'transitioned';
export type TaskLaneHandoffRequestType =
  | 'environment_preparation'
  | 'runtime_context'
  | 'clarification'
  | 'rerun_command';
export type TaskLaneHandoffStatus =
  | 'requested'
  | 'delivered'
  | 'completed'
  | 'blocked'
  | 'failed';

export interface TaskLaneSessionPayload {
  columnId?: string;
  columnName?: string;
  completedAt?: string;
  provider?: string;
  role?: string;
  routaAgentId?: string;
  sessionId: string;
  specialistId?: string;
  specialistName?: string;
  startedAt: string;
  status: TaskLaneSessionStatus;
}

export interface TaskLaneHandoffPayload {
  fromColumnId?: string;
  fromSessionId: string;
  id: string;
  request: string;
  requestType: TaskLaneHandoffRequestType;
  requestedAt: string;
  respondedAt?: string;
  responseSummary?: string;
  status: TaskLaneHandoffStatus;
  toColumnId?: string;
  toSessionId: string;
}

export interface TaskPayload {
  acceptanceCriteria: string[];
  assignedProvider: string | null;
  assignedRole: string | null;
  assignedSpecialistId: string | null;
  assignedSpecialistName: string | null;
  assignee: string | null;
  boardId: string | null;
  codebaseId: string | null;
  columnId: string | null;
  completionSummary: string | null;
  createdAt: string;
  dependencies: string[];
  githubId: string | null;
  githubNumber: number | null;
  githubRepo: string | null;
  githubState: string | null;
  githubSyncedAt: string | null;
  githubUrl: string | null;
  id: string;
  kind: TaskKind | null;
  laneHandoffs: TaskLaneHandoffPayload[];
  laneSessions: TaskLaneSessionPayload[];
  labels: string[];
  lastSyncError: string | null;
  objective: string;
  executionSessionId: string | null;
  parallelGroup: string | null;
  parentTaskId: string | null;
  position: number | null;
  priority: string | null;
  projectId: string;
  resultSessionId: string | null;
  sessionIds: string[];
  sessionId: string | null;
  scope: string | null;
  sourceEntryIndex: number | null;
  sourceEventId: string | null;
  sourceType: string;
  status: string;
  title: string;
  triggerSessionId: string | null;
  updatedAt: string;
  verificationCommands: string[];
  verificationReport: string | null;
  verificationVerdict: string | null;
  workspaceId: string;
  codebaseIds: string[];
  worktreeId: string | null;
}

export interface TaskListPayload {
  items: TaskPayload[];
  page: number;
  pageSize: number;
  projectId?: string;
  sessionId?: string;
  status?: string;
  total: number;
}

export interface CreateTaskInput {
  acceptanceCriteria?: string[];
  assignedProvider?: string | null;
  assignedRole?: string | null;
  assignedSpecialistId?: string | null;
  assignedSpecialistName?: string | null;
  assignee?: string | null;
  boardId?: string | null;
  codebaseId?: string | null;
  codebaseIds?: string[];
  columnId?: string | null;
  completionSummary?: string | null;
  dependencies?: string[];
  githubId?: string | null;
  githubNumber?: number | null;
  githubRepo?: string | null;
  githubState?: string | null;
  githubSyncedAt?: string | null;
  githubUrl?: string | null;
  kind?: TaskKind | null;
  labels?: string[];
  laneHandoffs?: TaskLaneHandoffPayload[];
  laneSessions?: TaskLaneSessionPayload[];
  lastSyncError?: string | null;
  objective: string;
  executionSessionId?: string | null;
  parallelGroup?: string | null;
  parentTaskId?: string | null;
  position?: number | null;
  priority?: string | null;
  projectId: string;
  resultSessionId?: string | null;
  sessionIds?: string[];
  sessionId?: string | null;
  scope?: string | null;
  sourceEntryIndex?: number | null;
  sourceEventId?: string | null;
  sourceType?: string | null;
  status?: string;
  title: string;
  verificationCommands?: string[];
  verificationReport?: string | null;
  verificationVerdict?: string | null;
  worktreeId?: string | null;
}

export interface UpdateTaskInput {
  acceptanceCriteria?: string[];
  assignedProvider?: string | null;
  assignedRole?: string | null;
  assignedSpecialistId?: string | null;
  assignedSpecialistName?: string | null;
  assignee?: string | null;
  boardId?: string | null;
  codebaseId?: string | null;
  codebaseIds?: string[];
  columnId?: string | null;
  completionSummary?: string | null;
  dependencies?: string[];
  githubId?: string | null;
  githubNumber?: number | null;
  githubRepo?: string | null;
  githubState?: string | null;
  githubSyncedAt?: string | null;
  githubUrl?: string | null;
  kind?: TaskKind | null;
  labels?: string[];
  laneHandoffs?: TaskLaneHandoffPayload[];
  laneSessions?: TaskLaneSessionPayload[];
  lastSyncError?: string | null;
  objective?: string;
  executionSessionId?: string | null;
  parallelGroup?: string | null;
  parentTaskId?: string | null;
  position?: number | null;
  priority?: string | null;
  scope?: string | null;
  resultSessionId?: string | null;
  sessionIds?: string[];
  sessionId?: string | null;
  sourceEntryIndex?: number | null;
  sourceEventId?: string | null;
  sourceType?: string | null;
  status?: string;
  title?: string;
  triggerSessionId?: string | null;
  verificationCommands?: string[];
  verificationReport?: string | null;
  verificationVerdict?: string | null;
  worktreeId?: string | null;
}
