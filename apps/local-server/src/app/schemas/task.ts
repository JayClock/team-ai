export interface TaskPayload {
  acceptanceCriteria: string[];
  assignedProvider: string | null;
  assignedRole: string | null;
  assignedSpecialistId: string | null;
  assignedSpecialistName: string | null;
  assignee: string | null;
  boardId: string | null;
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
  labels: string[];
  lastSyncError: string | null;
  objective: string;
  parallelGroup: string | null;
  position: number | null;
  priority: string | null;
  projectId: string;
  scope: string | null;
  status: string;
  title: string;
  triggerSessionId: string | null;
  updatedAt: string;
  verificationCommands: string[];
  verificationReport: string | null;
  verificationVerdict: string | null;
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
  columnId?: string | null;
  completionSummary?: string | null;
  dependencies?: string[];
  githubId?: string | null;
  githubNumber?: number | null;
  githubRepo?: string | null;
  githubState?: string | null;
  githubSyncedAt?: string | null;
  githubUrl?: string | null;
  labels?: string[];
  lastSyncError?: string | null;
  objective: string;
  parallelGroup?: string | null;
  position?: number | null;
  priority?: string | null;
  projectId: string;
  scope?: string | null;
  status?: string;
  title: string;
  triggerSessionId?: string | null;
  verificationCommands?: string[];
  verificationReport?: string | null;
  verificationVerdict?: string | null;
}

export interface UpdateTaskInput {
  acceptanceCriteria?: string[];
  assignedProvider?: string | null;
  assignedRole?: string | null;
  assignedSpecialistId?: string | null;
  assignedSpecialistName?: string | null;
  assignee?: string | null;
  boardId?: string | null;
  columnId?: string | null;
  completionSummary?: string | null;
  dependencies?: string[];
  githubId?: string | null;
  githubNumber?: number | null;
  githubRepo?: string | null;
  githubState?: string | null;
  githubSyncedAt?: string | null;
  githubUrl?: string | null;
  labels?: string[];
  lastSyncError?: string | null;
  objective?: string;
  parallelGroup?: string | null;
  position?: number | null;
  priority?: string | null;
  scope?: string | null;
  status?: string;
  title?: string;
  triggerSessionId?: string | null;
  verificationCommands?: string[];
  verificationReport?: string | null;
  verificationVerdict?: string | null;
}
