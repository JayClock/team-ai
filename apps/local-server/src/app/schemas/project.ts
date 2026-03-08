export interface ProjectPayload {
  createdAt: string;
  description: string | null;
  id: string;
  title: string;
  updatedAt: string;
}

export interface ProjectListPayload {
  items: ProjectPayload[];
  page: number;
  pageSize: number;
  q?: string;
  total: number;
}

export interface CreateProjectInput {
  description?: string;
  title: string;
}

export interface UpdateProjectInput {
  description?: string | null;
  title?: string;
}
