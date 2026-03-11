export interface SessionPayload {
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  parentSessionId: string | null;
  projectId: string;
  status: string;
  title: string;
  updatedAt: string;
}

export interface SessionListPayload {
  items: SessionPayload[];
  page: number;
  pageSize: number;
  projectId?: string;
  status?: string;
  total: number;
}

export interface SessionContextPayload {
  children: SessionPayload[];
  current: SessionPayload;
  parent: SessionPayload | null;
  recentInWorkspace: SessionPayload[];
  siblings: SessionPayload[];
}

export interface SessionHistoryPayload {
  currentSessionId: string;
  items: SessionPayload[];
}

export interface CreateSessionInput {
  metadata?: Record<string, unknown>;
  parentSessionId?: string;
  projectId: string;
  status?: string;
  title: string;
}

export interface UpdateSessionInput {
  metadata?: Record<string, unknown>;
  parentSessionId?: string | null;
  status?: string;
  title?: string;
}
