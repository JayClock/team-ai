import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentWebhookConfig,
  presentWebhookConfigList,
  presentWebhookTriggerLogList,
} from '../presenters/webhook-presenter';
import {
  createWebhookConfig,
  deleteWebhookConfig,
  getWebhookConfigById,
  listProjectWebhookConfigs,
  listWebhookTriggerLogs,
  receiveGitHubWebhook,
  updateWebhookConfig,
} from '../services/webhook-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const webhookConfigParamsSchema = z.object({
  webhookConfigId: z.string().min(1),
});

const listWebhookConfigsQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
});

const listWebhookLogsQuerySchema = z.object({
  configId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  projectId: z.string().min(1).optional(),
});

const createWebhookConfigBodySchema = z.object({
  enabled: z.boolean().optional(),
  eventTypes: z.array(z.string().trim().min(1)).min(1),
  name: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  repo: z.string().trim().min(1),
  webhookSecret: z.string().optional(),
  workflowId: z.string().trim().min(1),
});

const updateWebhookConfigBodySchema = z.object({
  enabled: z.boolean().optional(),
  eventTypes: z.array(z.string().trim().min(1)).min(1).optional(),
  name: z.string().trim().min(1).optional(),
  repo: z.string().trim().min(1).optional(),
  webhookSecret: z.string().optional(),
  workflowId: z.string().trim().min(1).optional(),
});

function parseJsonBody(body: unknown) {
  if (typeof body !== 'string') {
    return {};
  }

  return JSON.parse(body) as unknown;
}

const webhooksRoute: FastifyPluginAsync = async (fastify) => {
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done) => {
      done(null, body);
    },
  );

  fastify.get('/webhooks/configs', async (request, reply) => {
    const query = listWebhookConfigsQuerySchema.parse(request.query);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.webhookConfigs);

    return presentWebhookConfigList(
      await listProjectWebhookConfigs(fastify.sqlite, query.projectId),
    );
  });

  fastify.post('/webhooks/configs', async (request, reply) => {
    const body = createWebhookConfigBodySchema.parse(parseJsonBody(request.body));
    const config = await createWebhookConfig(fastify.sqlite, body);

    reply
      .code(201)
      .header('Location', `/api/webhooks/configs/${config.id}`)
      .type(VENDOR_MEDIA_TYPES.webhookConfig);
    return presentWebhookConfig(config);
  });

  fastify.get('/webhooks/configs/:webhookConfigId', async (request, reply) => {
    const { webhookConfigId } = webhookConfigParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.webhookConfig);

    return presentWebhookConfig(
      getWebhookConfigById(fastify.sqlite, webhookConfigId),
    );
  });

  fastify.patch(
    '/webhooks/configs/:webhookConfigId',
    async (request, reply) => {
      const { webhookConfigId } = webhookConfigParamsSchema.parse(request.params);
      const body = updateWebhookConfigBodySchema.parse(parseJsonBody(request.body));
      const config = await updateWebhookConfig(fastify.sqlite, {
        ...body,
        id: webhookConfigId,
      });

      reply.type(VENDOR_MEDIA_TYPES.webhookConfig);
      return presentWebhookConfig(config);
    },
  );

  fastify.delete(
    '/webhooks/configs/:webhookConfigId',
    async (request, reply) => {
      const { webhookConfigId } = webhookConfigParamsSchema.parse(request.params);
      await deleteWebhookConfig(fastify.sqlite, webhookConfigId);

      reply.code(204);
      return null;
    },
  );

  fastify.get('/webhooks/webhook-logs', async (request, reply) => {
    const query = listWebhookLogsQuerySchema.parse(request.query);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.webhookLogs);

    return presentWebhookTriggerLogList(
      await listWebhookTriggerLogs(fastify.sqlite, query),
    );
  });

  fastify.get('/webhooks/github', async () => ({
    endpoint: 'GitHub Webhook Receiver',
    info: 'Configure this URL as a GitHub repository webhook to receive events.',
    status: 'ok',
  }));

  fastify.post('/webhooks/github', async (request) => {
    const rawBody =
      typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body ?? {});
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const eventType = request.headers['x-github-event'];
    const deliveryId = request.headers['x-github-delivery'];
    const signature = request.headers['x-hub-signature-256'];

    const result = await receiveGitHubWebhook(fastify.sqlite, {
      deliveryId: Array.isArray(deliveryId) ? deliveryId[0] : deliveryId,
      eventType: z.string().min(1).parse(
        Array.isArray(eventType) ? eventType[0] : eventType,
      ),
      payload,
      rawBody,
      signature: Array.isArray(signature) ? signature[0] : signature,
    });

    return {
      deliveryId: Array.isArray(deliveryId) ? deliveryId[0] : deliveryId ?? null,
      ok: true,
      processed: result.processed,
      skipped: result.skipped,
    };
  });
};

export default webhooksRoute;
