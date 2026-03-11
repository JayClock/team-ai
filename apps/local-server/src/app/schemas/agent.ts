export interface AgentPayload {
  createdAt: string;
  id: string;
  model: string;
  name: string;
  provider: string;
  projectId: string;
  role: string;
  systemPrompt: string | null;
  updatedAt: string;
}

export interface AgentListPayload {
  items: AgentPayload[];
  page: number;
  pageSize: number;
  projectId: string;
  total: number;
}

export interface CreateAgentInput {
  model: string;
  name: string;
  provider: string;
  projectId: string;
  role: string;
  systemPrompt?: string | null;
}

export interface UpdateAgentInput {
  model?: string;
  name?: string;
  provider?: string;
  role?: string;
  systemPrompt?: string | null;
}
