import type {
  WebhookConfigListPayload,
  WebhookConfigPayload,
  WebhookTriggerLogListPayload,
  WebhookTriggerLogPayload,
} from '../schemas/webhook';

function presentWebhookConfigResource(config: WebhookConfigPayload) {
  return {
    _links: {
      collection: {
        href: `/api/webhooks/configs?projectId=${encodeURIComponent(config.projectId)}`,
      },
      logs: {
        href: `/api/webhooks/webhook-logs?configId=${encodeURIComponent(config.id)}`,
      },
      self: {
        href: `/api/webhooks/configs/${config.id}`,
      },
      workflow: {
        href: `/api/workflows/${config.workflowId}`,
      },
    },
    ...config,
  };
}

function presentWebhookTriggerLogResource(log: WebhookTriggerLogPayload) {
  return {
    _links: {
      config: {
        href: `/api/webhooks/configs/${log.configId}`,
      },
      ...(log.workflowRunId
        ? {
            workflowRun: {
              href: `/api/workflow-runs/${log.workflowRunId}`,
            },
          }
        : {}),
    },
    ...log,
  };
}

export function presentWebhookConfig(config: WebhookConfigPayload) {
  return presentWebhookConfigResource(config);
}

export function presentWebhookConfigList(payload: WebhookConfigListPayload) {
  const href = payload.projectId
    ? `/api/webhooks/configs?projectId=${encodeURIComponent(payload.projectId)}`
    : '/api/webhooks/configs';

  return {
    _embedded: {
      webhookConfigs: payload.items.map(presentWebhookConfigResource),
    },
    _links: {
      self: {
        href,
      },
    },
  };
}

export function presentWebhookTriggerLogList(payload: WebhookTriggerLogListPayload) {
  const params = new URLSearchParams();
  if (payload.configId) {
    params.set('configId', payload.configId);
  }
  if (payload.projectId) {
    params.set('projectId', payload.projectId);
  }

  return {
    _embedded: {
      webhookLogs: payload.items.map(presentWebhookTriggerLogResource),
    },
    _links: {
      self: {
        href: params.size > 0
          ? `/api/webhooks/webhook-logs?${params.toString()}`
          : '/api/webhooks/webhook-logs',
      },
    },
  };
}
