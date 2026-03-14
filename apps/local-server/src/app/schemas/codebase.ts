export interface CodebasePayload {
  branch: string | null;
  createdAt: string;
  id: string;
  isDefault: boolean;
  projectId: string;
  repoPath: string | null;
  sourceType: 'github' | 'local' | null;
  sourceUrl: string | null;
  title: string;
  updatedAt: string;
}

export interface CodebaseListPayload {
  items: CodebasePayload[];
  projectId: string;
}

export interface CloneProjectCodebaseInput {
  repositoryUrl: string;
  title?: string;
}

