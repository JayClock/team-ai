import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { listBackgroundTasks } from './background-task-service';
import { createProject } from './project-service';
import {
  createWebhookConfig,
  getWebhookConfigById,
  listProjectWebhookConfigs,
  listWebhookTriggerLogs,
  receiveGitHubWebhook,
  updateWebhookConfig,
} from './webhook-service';
import { createWorkflow, listWorkflowRuns } from './workflow-service';

describe('webhook service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('creates, reads, updates, and lists webhook configs for a project', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-webhook-config-service',
      title: 'Webhook Config Service',
    });
    const workflow = await createWorkflow(sqlite, {
      name: 'PR workflow',
      projectId: project.id,
      steps: [
        {
          name: 'Review webhook',
          parallelGroup: null,
          prompt: 'Review ${trigger.payload}',
          specialistId: 'backend-crafter',
        },
      ],
    });

    const config = await createWebhookConfig(sqlite, {
      eventTypes: ['pull_request'],
      name: 'PR opened',
      projectId: project.id,
      repo: 'acme/platform',
      webhookSecret: 'test-secret',
      workflowId: workflow.id,
    });

    expect(config).toMatchObject({
      eventTypes: ['pull_request'],
      name: 'PR opened',
      projectId: project.id,
      repo: 'acme/platform',
      source: 'github',
      webhookSecretConfigured: true,
      workflowId: workflow.id,
    });

    const listed = await listProjectWebhookConfigs(sqlite, project.id);
    expect(listed.items.map((item) => item.id)).toContain(config.id);

    const updated = await updateWebhookConfig(sqlite, {
      enabled: false,
      id: config.id,
      name: 'PR opened updated',
    });

    expect(updated).toMatchObject({
      enabled: false,
      id: config.id,
      name: 'PR opened updated',
    });
    expect(getWebhookConfigById(sqlite, config.id)).toMatchObject({
      enabled: false,
      name: 'PR opened updated',
    });
  });

  it('turns matching GitHub events into workflow runs and webhook logs', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-webhook-trigger-service',
      title: 'Webhook Trigger Service',
    });
    const workflow = await createWorkflow(sqlite, {
      name: 'PR workflow',
      projectId: project.id,
      steps: [
        {
          name: 'Analyze PR',
          parallelGroup: null,
          prompt: 'Analyze ${trigger.payload}',
          specialistId: 'backend-crafter',
        },
      ],
    });
    const config = await createWebhookConfig(sqlite, {
      eventTypes: ['pull_request'],
      name: 'PR webhook',
      projectId: project.id,
      repo: 'acme/platform',
      workflowId: workflow.id,
    });

    const payload = {
      action: 'opened',
      pull_request: {
        number: 42,
        title: 'Improve webhook pipeline',
      },
      repository: {
        full_name: 'acme/platform',
      },
    };
    const result = await receiveGitHubWebhook(sqlite, {
      deliveryId: 'delivery-1',
      eventType: 'pull_request',
      payload,
      rawBody: JSON.stringify(payload),
    });

    expect(result).toMatchObject({
      processed: 1,
      skipped: 0,
    });
    expect(result.logs).toEqual([
      expect.objectContaining({
        configId: config.id,
        deliveryId: 'delivery-1',
        eventType: 'pull_request',
        outcome: 'triggered',
        signatureValid: true,
        workflowRunId: expect.any(String),
      }),
    ]);

    const workflowRuns = await listWorkflowRuns(sqlite, workflow.id);
    expect(workflowRuns.items).toEqual([
      expect.objectContaining({
        id: result.logs[0]?.workflowRunId,
        triggerSource: 'webhook',
        workflowId: workflow.id,
      }),
    ]);

    const backgroundTasks = await listBackgroundTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
    });
    expect(backgroundTasks.items).toEqual([
      expect.objectContaining({
        triggerSource: 'workflow',
        workflowRunId: result.logs[0]?.workflowRunId,
      }),
    ]);

    const logs = await listWebhookTriggerLogs(sqlite, {
      configId: config.id,
    });
    expect(logs.items).toEqual([
      expect.objectContaining({
        configId: config.id,
        eventAction: 'opened',
        eventType: 'pull_request',
        outcome: 'triggered',
      }),
    ]);
  });
});

async function createTestDatabase(cleanupTasks: Array<() => Promise<void>>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-webhook-service-'));
  const previousDataDir = process.env.TEAMAI_DATA_DIR;

  process.env.TEAMAI_DATA_DIR = dataDir;
  const sqlite = initializeDatabase();

  cleanupTasks.push(async () => {
    sqlite.close();
    if (previousDataDir === undefined) {
      delete process.env.TEAMAI_DATA_DIR;
    } else {
      process.env.TEAMAI_DATA_DIR = previousDataDir;
    }
    await rm(dataDir, { recursive: true, force: true });
  });

  return sqlite;
}
