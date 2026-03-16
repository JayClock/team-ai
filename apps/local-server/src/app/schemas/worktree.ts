export type WorktreeStatus = 'creating' | 'active' | 'error' | 'removing';

export interface WorktreePayload {
  baseBranch: string;
  branch: string;
  codebaseId: string;
  createdAt: string;
  errorMessage: string | null;
  id: string;
  label: string | null;
  projectId: string;
  sessionId: string | null;
  status: WorktreeStatus;
  updatedAt: string;
  worktreePath: string;
}

export interface WorktreeListPayload {
  codebaseId: string;
  items: WorktreePayload[];
  projectId: string;
}
