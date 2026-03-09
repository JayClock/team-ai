export interface ProjectPayload {
  createdAt: string;
  description: string | null;
  id: string;
  sourceType: 'github' | 'local' | null;
  sourceUrl: string | null;
  title: string;
  updatedAt: string;
  workspaceRoot: string | null;
}

export interface ProjectListPayload {
  items: ProjectPayload[];
  page: number;
  pageSize: number;
  q?: string;
  sourceUrl?: string;
  total: number;
  workspaceRoot?: string;
}

export interface CreateProjectInput {
  description?: string;
  sourceType?: 'github' | 'local';
  sourceUrl?: string;
  title: string;
  workspaceRoot?: string;
}

export interface UpdateProjectInput {
  description?: string | null;
  sourceType?: 'github' | 'local' | null;
  sourceUrl?: string | null;
  title?: string;
  workspaceRoot?: string | null;
}
