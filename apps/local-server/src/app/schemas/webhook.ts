export type WebhookSource = 'github';
export type WebhookTriggerOutcome = 'error' | 'skipped' | 'triggered';

export interface WebhookConfigPayload {
  createdAt: string;
  enabled: boolean;
  eventTypes: string[];
  id: string;
  name: string;
  projectId: string;
  repo: string;
  source: WebhookSource;
  updatedAt: string;
  webhookSecretConfigured: boolean;
  workflowId: string;
}

export interface WebhookConfigListPayload {
  items: WebhookConfigPayload[];
  projectId: string | null;
}

export interface CreateWebhookConfigInput {
  enabled?: boolean;
  eventTypes: string[];
  name: string;
  projectId: string;
  repo: string;
  webhookSecret?: string;
  workflowId: string;
}

export interface UpdateWebhookConfigInput {
  enabled?: boolean;
  eventTypes?: string[];
  id: string;
  name?: string;
  repo?: string;
  webhookSecret?: string;
  workflowId?: string;
}

export interface ReceiveGitHubWebhookInput {
  deliveryId?: string;
  eventType: string;
  payload: Record<string, unknown>;
  rawBody: string;
  signature?: string;
}

export interface WebhookTriggerLogPayload {
  configId: string;
  createdAt: string;
  deliveryId: string | null;
  errorMessage: string | null;
  eventAction: string | null;
  eventType: string;
  id: string;
  outcome: WebhookTriggerOutcome;
  payload: Record<string, unknown>;
  projectId: string;
  signatureValid: boolean;
  workflowRunId: string | null;
}

export interface WebhookTriggerLogListPayload {
  configId: string | null;
  items: WebhookTriggerLogPayload[];
  projectId: string | null;
}

export interface ListWebhookTriggerLogsInput {
  configId?: string;
  limit?: number;
  projectId?: string;
}

export interface ReceiveGitHubWebhookResult {
  logs: WebhookTriggerLogPayload[];
  processed: number;
  skipped: number;
}
