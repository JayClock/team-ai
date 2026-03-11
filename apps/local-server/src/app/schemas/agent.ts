export interface AgentPayload {
  createdAt: string;
  id: string;
  model: string;
  name: string;
  parentAgentId: string | null;
  provider: string;
  projectId: string;
  role: string;
  specialistId: string | null;
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
  parentAgentId?: string | null;
  provider: string;
  projectId: string;
  role: string;
  specialistId?: string | null;
  systemPrompt?: string | null;
}

export interface UpdateAgentInput {
  model?: string;
  name?: string;
  parentAgentId?: string | null;
  provider?: string;
  role?: string;
  specialistId?: string | null;
  systemPrompt?: string | null;
}
