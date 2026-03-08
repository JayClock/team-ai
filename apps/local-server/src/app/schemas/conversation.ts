export interface ConversationPayload {
  createdAt: string;
  id: string;
  projectId: string;
  title: string;
  updatedAt: string;
}

export interface ConversationListPayload {
  items: ConversationPayload[];
  page: number;
  pageSize: number;
  projectId: string;
  total: number;
}

export interface CreateConversationInput {
  title: string;
}

export interface UpdateConversationInput {
  title: string;
}
