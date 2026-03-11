export interface ProjectPayload {
  createdAt: string;
  description: string | null;
  id: string;
  repoPath: string | null;
  sourceType: 'github' | 'local' | null;
  sourceUrl: string | null;
  title: string;
  updatedAt: string;
}

export interface ProjectListPayload {
  items: ProjectPayload[];
  page: number;
  pageSize: number;
  q?: string;
  repoPath?: string;
  sourceUrl?: string;
  total: number;
}

export interface CreateProjectInput {
  description?: string;
  repoPath?: string;
  sourceType?: 'github' | 'local';
  sourceUrl?: string;
  title: string;
}

export interface UpdateProjectInput {
  description?: string | null;
  repoPath?: string | null;
  sourceType?: 'github' | 'local' | null;
  sourceUrl?: string | null;
  title?: string;
}
