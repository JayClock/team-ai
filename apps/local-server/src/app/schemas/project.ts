export interface ProjectPayload {
  createdAt: string;
  description: string | null;
  id: string;
  title: string;
  updatedAt: string;
  workspaceRoot: string | null;
}

export interface ProjectListPayload {
  items: ProjectPayload[];
  page: number;
  pageSize: number;
  q?: string;
  total: number;
  workspaceRoot?: string;
}

export interface CreateProjectInput {
  description?: string;
  title: string;
  workspaceRoot?: string;
}

export interface UpdateProjectInput {
  description?: string | null;
  title?: string;
  workspaceRoot?: string | null;
}
