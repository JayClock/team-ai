export interface MessagePayload {
  content: string;
  conversationId: string;
  createdAt: string;
  errorMessage: string | null;
  id: string;
  retryCount: number;
  role: 'assistant' | 'user';
  status: 'completed' | 'failed' | 'pending' | 'streaming';
  updatedAt: string;
}

export interface MessageListPayload {
  conversationId: string;
  items: MessagePayload[];
  page: number;
  pageSize: number;
  total: number;
}
