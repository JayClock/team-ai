import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '@orchestration/runtime-acp';
import type {
  CreateWebhookConfigInput,
  ListWebhookTriggerLogsInput,
  ReceiveGitHubWebhookInput,
  ReceiveGitHubWebhookResult,
  UpdateWebhookConfigInput,
  WebhookConfigListPayload,
  WebhookConfigPayload,
  WebhookTriggerLogListPayload,
  WebhookTriggerLogPayload,
} from '../schemas/webhook';
import { getProjectById } from './project-service';
import { upsertExternalKanbanCard } from './kanban-external-trigger-service';
import { getWorkflowById, triggerWorkflow } from './workflow-service';

const webhookConfigIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);
const webhookLogIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface WebhookConfigRow {
  created_at: string;
  enabled: number;
  event_types_json: string;
  id: string;
  name: string;
  project_id: string;
  repo: string;
  source: 'github';
  updated_at: string;
  webhook_secret: string;
  workflow_id: string;
}

interface WebhookLogRow {
  config_id: string;
  created_at: string;
  delivery_id: string | null;
  error_message: string | null;
  event_action: string | null;
  event_type: string;
  id: string;
  outcome: 'error' | 'skipped' | 'triggered';
  payload_json: string;
  project_id: string;
  signature_valid: number;
  workflow_run_id: string | null;
}

function createWebhookConfigId() {
  return `whc_${webhookConfigIdGenerator()}`;
}

function createWebhookLogId() {
  return `whl_${webhookLogIdGenerator()}`;
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseEventTypes(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function mapWebhookConfigRow(row: WebhookConfigRow): WebhookConfigPayload {
  return {
    createdAt: row.created_at,
    enabled: row.enabled === 1,
    eventTypes: parseEventTypes(row.event_types_json),
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    repo: row.repo,
    source: row.source,
    updatedAt: row.updated_at,
    webhookSecretConfigured: row.webhook_secret.length > 0,
    workflowId: row.workflow_id,
  };
}

function mapWebhookLogRow(row: WebhookLogRow): WebhookTriggerLogPayload {
  return {
    configId: row.config_id,
    createdAt: row.created_at,
    deliveryId: row.delivery_id,
    errorMessage: row.error_message,
    eventAction: row.event_action,
    eventType: row.event_type,
    id: row.id,
    outcome: row.outcome,
    payload: parseJsonRecord(row.payload_json),
    projectId: row.project_id,
    signatureValid: row.signature_valid === 1,
    workflowRunId: row.workflow_run_id,
  };
}

function throwWebhookConfigNotFound(webhookConfigId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/webhook-config-not-found',
    title: 'Webhook Config Not Found',
    status: 404,
    detail: `Webhook config ${webhookConfigId} was not found`,
  });
}

function throwInvalidWebhookConfig(detail: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/invalid-webhook-config',
    title: 'Invalid Webhook Config',
    status: 400,
    detail,
  });
}

function throwWebhookConfigNameConflict(projectId: string, name: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/webhook-config-name-conflict',
    title: 'Webhook Config Name Conflict',
    status: 409,
    detail: `Webhook config ${name} already exists in project ${projectId}`,
  });
}

function getWebhookConfigRow(
  sqlite: Database,
  webhookConfigId: string,
): WebhookConfigRow {
  const row = sqlite
    .prepare(
      `
        SELECT id, project_id, name, source, repo, event_types_json, workflow_id,
               webhook_secret, enabled, created_at, updated_at
        FROM project_webhook_configs
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(webhookConfigId) as WebhookConfigRow | undefined;

  if (!row) {
    throwWebhookConfigNotFound(webhookConfigId);
  }

  return row;
}

function validateEventTypes(eventTypes: string[]) {
  if (eventTypes.length === 0) {
    throwInvalidWebhookConfig(
      'Webhook config must include at least one event type',
    );
  }
}

function normalizeRepo(repo: string) {
  const normalized = repo.trim();
  if (!normalized) {
    throwInvalidWebhookConfig('Webhook config repo must not be empty');
  }
  return normalized;
}

function matchesEventType(config: WebhookConfigPayload, eventType: string) {
  return config.eventTypes.includes('*') || config.eventTypes.includes(eventType);
}

function verifyGitHubSignature(
  secret: string,
  rawBody: string,
  signature: string | undefined,
) {
  if (!secret) {
    return true;
  }
  if (!signature) {
    return false;
  }

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function buildWebhookTriggerPayload(input: {
  deliveryId?: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  return JSON.stringify(
    {
      action:
        typeof input.payload.action === 'string' ? input.payload.action : null,
      deliveryId: input.deliveryId ?? null,
      eventType: input.eventType,
      payload: input.payload,
      repository:
        typeof input.payload.repository === 'object' &&
        input.payload.repository !== null
          ? input.payload.repository
          : null,
    },
    null,
    2,
  );
}

function buildGitHubWebhookCard(input: {
  deliveryId?: string;
  eventType: string;
  payload: Record<string, unknown>;
  repo: string | null;
}) {
  const action =
    typeof input.payload.action === 'string' ? input.payload.action : null;

  if (input.eventType === 'pull_request') {
    const pullRequest =
      typeof input.payload.pull_request === 'object' &&
      input.payload.pull_request !== null
        ? (input.payload.pull_request as {
            html_url?: unknown;
            merged?: unknown;
            number?: unknown;
            state?: unknown;
            title?: unknown;
          })
        : null;
    const number =
      typeof pullRequest?.number === 'number'
        ? pullRequest.number
        : typeof input.payload.number === 'number'
          ? input.payload.number
          : null;
    const title =
      typeof pullRequest?.title === 'string'
        ? pullRequest.title
        : 'GitHub pull request';
    const state =
      typeof pullRequest?.state === 'string' ? pullRequest.state : null;
    const merged = pullRequest?.merged === true;

    return {
      githubNumber: number,
      githubRepo: input.repo,
      githubState: merged ? 'merged' : state,
      githubUrl:
        typeof pullRequest?.html_url === 'string' ? pullRequest.html_url : null,
      kind: 'review' as const,
      labels: ['external:github', 'github:pull_request'],
      objective: `Review GitHub pull request ${number ? `#${number}` : ''} after ${action ?? 'event'} webhook delivery.`,
      sourceEventId: `github:pull_request:${input.repo ?? 'unknown'}:${number ?? 'unknown'}`,
      sourceType: 'webhook',
      stage:
        merged || state === 'closed'
          ? ('done' as const)
          : ('review' as const),
      title: `${merged || state === 'closed' ? 'Complete' : 'Review'} PR${
        number ? ` #${number}` : ''
      } · ${title}`,
    };
  }

  if (input.eventType === 'issues') {
    const issue =
      typeof input.payload.issue === 'object' && input.payload.issue !== null
        ? (input.payload.issue as {
            html_url?: unknown;
            number?: unknown;
            state?: unknown;
            title?: unknown;
          })
        : null;
    const number =
      typeof issue?.number === 'number'
        ? issue.number
        : typeof input.payload.number === 'number'
          ? input.payload.number
          : null;
    const title = typeof issue?.title === 'string' ? issue.title : 'GitHub issue';
    const state = typeof issue?.state === 'string' ? issue.state : null;

    return {
      githubNumber: number,
      githubRepo: input.repo,
      githubState: state,
      githubUrl: typeof issue?.html_url === 'string' ? issue.html_url : null,
      kind: 'plan' as const,
      labels: ['external:github', 'github:issue'],
      objective: `Triage GitHub issue ${number ? `#${number}` : ''} after ${action ?? 'event'} webhook delivery.`,
      sourceEventId: `github:issue:${input.repo ?? 'unknown'}:${number ?? 'unknown'}`,
      sourceType: 'webhook',
      stage: state === 'closed' ? ('done' as const) : ('backlog' as const),
      title: `${state === 'closed' ? 'Closed' : 'Triage'} issue${
        number ? ` #${number}` : ''
      } · ${title}`,
    };
  }

  if (input.eventType === 'push') {
    const ref =
      typeof input.payload.ref === 'string' ? input.payload.ref : 'unknown-ref';
    const branch = ref.replace('refs/heads/', '');

    return {
      githubNumber: null,
      githubRepo: input.repo,
      githubState: null,
      githubUrl: null,
      kind: 'implement' as const,
      labels: ['external:github', 'github:push'],
      objective: `Review the latest push on ${branch} and decide whether follow-up work should enter the board.`,
      sourceEventId: `github:push:${input.repo ?? 'unknown'}:${branch}`,
      sourceType: 'webhook',
      stage: 'backlog' as const,
      title: `Follow up push · ${branch}`,
    };
  }

  return null;
}

function appendWebhookLog(
  sqlite: Database,
  input: Omit<WebhookTriggerLogPayload, 'createdAt' | 'id'>,
) {
  const id = createWebhookLogId();
  const createdAt = new Date().toISOString();

  sqlite
    .prepare(
      `
        INSERT INTO project_webhook_logs (
          id, project_id, config_id, delivery_id, event_type, event_action,
          payload_json, signature_valid, outcome, error_message, workflow_run_id,
          created_at
        ) VALUES (
          @id, @projectId, @configId, @deliveryId, @eventType, @eventAction,
          @payloadJson, @signatureValid, @outcome, @errorMessage, @workflowRunId,
          @createdAt
        )
      `,
    )
    .run({
      configId: input.configId,
      createdAt,
      deliveryId: input.deliveryId,
      errorMessage: input.errorMessage,
      eventAction: input.eventAction,
      eventType: input.eventType,
      id,
      outcome: input.outcome,
      payloadJson: JSON.stringify(input.payload),
      projectId: input.projectId,
      signatureValid: input.signatureValid ? 1 : 0,
      workflowRunId: input.workflowRunId,
    });

  return {
    ...input,
    createdAt,
    id,
  };
}

export async function createWebhookConfig(
  sqlite: Database,
  input: CreateWebhookConfigInput,
): Promise<WebhookConfigPayload> {
  await getProjectById(sqlite, input.projectId);
  await getWorkflowById(sqlite, input.workflowId);
  validateEventTypes(input.eventTypes);

  const existing = sqlite
    .prepare(
      `
        SELECT id
        FROM project_webhook_configs
        WHERE project_id = ? AND name = ? AND deleted_at IS NULL
      `,
    )
    .get(input.projectId, input.name) as { id: string } | undefined;

  if (existing) {
    throwWebhookConfigNameConflict(input.projectId, input.name);
  }

  const id = createWebhookConfigId();
  const now = new Date().toISOString();

  sqlite
    .prepare(
      `
        INSERT INTO project_webhook_configs (
          id, project_id, name, source, repo, event_types_json, workflow_id,
          webhook_secret, enabled, created_at, updated_at, deleted_at
        ) VALUES (
          @id, @projectId, @name, 'github', @repo, @eventTypesJson, @workflowId,
          @webhookSecret, @enabled, @createdAt, @updatedAt, NULL
        )
      `,
    )
    .run({
      createdAt: now,
      enabled: input.enabled === false ? 0 : 1,
      eventTypesJson: JSON.stringify(input.eventTypes),
      id,
      name: input.name,
      projectId: input.projectId,
      repo: normalizeRepo(input.repo),
      updatedAt: now,
      webhookSecret: input.webhookSecret?.trim() ?? '',
      workflowId: input.workflowId,
    });

  return getWebhookConfigById(sqlite, id);
}

export async function listProjectWebhookConfigs(
  sqlite: Database,
  projectId?: string,
): Promise<WebhookConfigListPayload> {
  if (projectId) {
    await getProjectById(sqlite, projectId);
  }

  const rows = sqlite
    .prepare(
      `
        SELECT id, project_id, name, source, repo, event_types_json, workflow_id,
               webhook_secret, enabled, created_at, updated_at
        FROM project_webhook_configs
        WHERE deleted_at IS NULL
          AND (@projectId IS NULL OR project_id = @projectId)
        ORDER BY updated_at DESC, created_at DESC
      `,
    )
    .all({ projectId: projectId ?? null }) as WebhookConfigRow[];

  return {
    items: rows.map(mapWebhookConfigRow),
    projectId: projectId ?? null,
  };
}

export function getWebhookConfigById(
  sqlite: Database,
  webhookConfigId: string,
): WebhookConfigPayload {
  return mapWebhookConfigRow(getWebhookConfigRow(sqlite, webhookConfigId));
}

export async function updateWebhookConfig(
  sqlite: Database,
  input: UpdateWebhookConfigInput,
): Promise<WebhookConfigPayload> {
  const existing = getWebhookConfigRow(sqlite, input.id);

  if (input.workflowId) {
    await getWorkflowById(sqlite, input.workflowId);
  }
  if (input.eventTypes) {
    validateEventTypes(input.eventTypes);
  }

  if (input.name && input.name !== existing.name) {
    const duplicate = sqlite
      .prepare(
        `
          SELECT id
          FROM project_webhook_configs
          WHERE project_id = ? AND name = ? AND deleted_at IS NULL AND id <> ?
        `,
      )
      .get(
        existing.project_id,
        input.name,
        input.id,
      ) as { id: string } | undefined;

    if (duplicate) {
      throwWebhookConfigNameConflict(existing.project_id, input.name);
    }
  }

  sqlite
    .prepare(
      `
        UPDATE project_webhook_configs
        SET
          name = COALESCE(@name, name),
          repo = COALESCE(@repo, repo),
          event_types_json = COALESCE(@eventTypesJson, event_types_json),
          workflow_id = COALESCE(@workflowId, workflow_id),
          webhook_secret = CASE
            WHEN @webhookSecret IS NULL THEN webhook_secret
            ELSE @webhookSecret
          END,
          enabled = COALESCE(@enabled, enabled),
          updated_at = @updatedAt
        WHERE id = @id AND deleted_at IS NULL
      `,
    )
    .run({
      enabled:
        typeof input.enabled === 'boolean' ? (input.enabled ? 1 : 0) : null,
      eventTypesJson: input.eventTypes
        ? JSON.stringify(input.eventTypes)
        : null,
      id: input.id,
      name: input.name ?? null,
      repo: input.repo ? normalizeRepo(input.repo) : null,
      updatedAt: new Date().toISOString(),
      webhookSecret:
        input.webhookSecret !== undefined ? input.webhookSecret.trim() : null,
      workflowId: input.workflowId ?? null,
    });

  return getWebhookConfigById(sqlite, input.id);
}

export async function deleteWebhookConfig(
  sqlite: Database,
  webhookConfigId: string,
): Promise<void> {
  getWebhookConfigRow(sqlite, webhookConfigId);

  const now = new Date().toISOString();

  sqlite
    .prepare(
      `
        UPDATE project_webhook_configs
        SET deleted_at = @now, updated_at = @now
        WHERE id = @id AND deleted_at IS NULL
      `,
    )
    .run({
      id: webhookConfigId,
      now,
    });
}

export async function listWebhookTriggerLogs(
  sqlite: Database,
  input: ListWebhookTriggerLogsInput = {},
): Promise<WebhookTriggerLogListPayload> {
  if (input.projectId) {
    await getProjectById(sqlite, input.projectId);
  }
  if (input.configId) {
    getWebhookConfigRow(sqlite, input.configId);
  }

  const rows = sqlite
    .prepare(
      `
        SELECT id, project_id, config_id, delivery_id, event_type, event_action,
               payload_json, signature_valid, outcome, error_message,
               workflow_run_id, created_at
        FROM project_webhook_logs
        WHERE (@projectId IS NULL OR project_id = @projectId)
          AND (@configId IS NULL OR config_id = @configId)
        ORDER BY created_at DESC
        LIMIT @limit
      `,
    )
    .all({
      configId: input.configId ?? null,
      limit: Math.min(Math.max(input.limit ?? 50, 1), 200),
      projectId: input.projectId ?? null,
    }) as WebhookLogRow[];

  return {
    configId: input.configId ?? null,
    items: rows.map(mapWebhookLogRow),
    projectId: input.projectId ?? null,
  };
}

export async function receiveGitHubWebhook(
  sqlite: Database,
  input: ReceiveGitHubWebhookInput,
): Promise<ReceiveGitHubWebhookResult> {
  const repo =
    typeof input.payload.repository === 'object' &&
    input.payload.repository !== null &&
    typeof (input.payload.repository as { full_name?: unknown }).full_name ===
      'string'
      ? (input.payload.repository as { full_name: string }).full_name
      : null;

  const rows = sqlite
    .prepare(
      `
        SELECT id, project_id, name, source, repo, event_types_json, workflow_id,
               webhook_secret, enabled, created_at, updated_at
        FROM project_webhook_configs
        WHERE source = 'github'
          AND enabled = 1
          AND deleted_at IS NULL
          AND (@repo IS NULL OR repo = @repo)
        ORDER BY created_at ASC
      `,
    )
    .all({ repo }) as WebhookConfigRow[];

  let processed = 0;
  let skipped = 0;
  const logs: WebhookTriggerLogPayload[] = [];

  for (const row of rows) {
    const config = mapWebhookConfigRow(row);

    if (!matchesEventType(config, input.eventType)) {
      continue;
    }

    const signatureValid = verifyGitHubSignature(
      row.webhook_secret,
      input.rawBody,
      input.signature,
    );

    if (!signatureValid) {
      skipped += 1;
      logs.push(
        appendWebhookLog(sqlite, {
          configId: config.id,
          deliveryId: input.deliveryId ?? null,
          errorMessage: 'Invalid GitHub webhook signature',
          eventAction:
            typeof input.payload.action === 'string' ? input.payload.action : null,
          eventType: input.eventType,
          outcome: 'skipped',
          payload: input.payload,
          projectId: config.projectId,
          signatureValid: false,
          workflowRunId: null,
        }),
      );
      continue;
    }

    try {
      const workflowTrigger = await triggerWorkflow(sqlite, config.workflowId, {
        triggerPayload: buildWebhookTriggerPayload({
          deliveryId: input.deliveryId,
          eventType: input.eventType,
          payload: input.payload,
        }),
        triggerSource: 'webhook',
      });
      const kanbanCard = buildGitHubWebhookCard({
        deliveryId: input.deliveryId,
        eventType: input.eventType,
        payload: input.payload,
        repo,
      });
      if (kanbanCard) {
        await upsertExternalKanbanCard(sqlite, {
          ...kanbanCard,
          projectId: config.projectId,
        });
      }

      processed += 1;
      logs.push(
        appendWebhookLog(sqlite, {
          configId: config.id,
          deliveryId: input.deliveryId ?? null,
          errorMessage: null,
          eventAction:
            typeof input.payload.action === 'string' ? input.payload.action : null,
          eventType: input.eventType,
          outcome: 'triggered',
          payload: input.payload,
          projectId: config.projectId,
          signatureValid: true,
          workflowRunId: workflowTrigger.workflowRun.id,
        }),
      );
    } catch (error) {
      skipped += 1;
      logs.push(
        appendWebhookLog(sqlite, {
          configId: config.id,
          deliveryId: input.deliveryId ?? null,
          errorMessage:
            error instanceof Error ? error.message : 'Webhook trigger failed',
          eventAction:
            typeof input.payload.action === 'string' ? input.payload.action : null,
          eventType: input.eventType,
          outcome: 'error',
          payload: input.payload,
          projectId: config.projectId,
          signatureValid: true,
          workflowRunId: null,
        }),
      );
    }
  }

  return {
    logs,
    processed,
    skipped,
  };
}
