import { join } from 'node:path';
import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import AutoLoad from '@fastify/autoload';
import acpRuntimePlugin from './plugins/acp-runtime';
import agentGatewayClientPlugin from './plugins/agent-gateway-client';
import acpStreamPlugin from './plugins/acp-stream';
import desktopAuthPlugin from './plugins/desktop-auth';
import desktopCorsPlugin from './plugins/desktop-cors';
import executionRuntimePlugin from './plugins/execution-runtime';
import backgroundWorkerPlugin from './plugins/background-worker';
import kanbanWorkflowOrchestratorPlugin from './plugins/kanban-workflow-orchestrator';
import workflowExecutorPlugin from './plugins/workflow-executor';
import problemJsonPlugin from './plugins/problem-json';
import schedulerPlugin from './plugins/scheduler';
import sensiblePlugin from './plugins/sensible';
import sqlitePlugin from './plugins/sqlite';

export interface AppOptions extends FastifyPluginOptions {
  agentGatewayBaseUrl?: string;
  backgroundWorkerEnabled?: boolean;
  backgroundWorkerIntervalMs?: number;
  desktopSessionToken?: string;
  schedulerEnabled?: boolean;
  schedulerTickIntervalMs?: number;
}

export const app: FastifyPluginAsync<AppOptions> = async (fastify, opts) => {
  fastify.register(problemJsonPlugin);
  fastify.register(sensiblePlugin);
  fastify.register(sqlitePlugin);
  fastify.register(acpStreamPlugin);
  fastify.register(executionRuntimePlugin, {
    agentGatewayBaseUrl: opts.agentGatewayBaseUrl,
  });
  fastify.register(agentGatewayClientPlugin, {
    agentGatewayBaseUrl: opts.agentGatewayBaseUrl,
  });
  fastify.register(acpRuntimePlugin);
  fastify.register(backgroundWorkerPlugin, {
    enabled: opts.backgroundWorkerEnabled,
    intervalMs: opts.backgroundWorkerIntervalMs,
  });
  fastify.register(kanbanWorkflowOrchestratorPlugin);
  fastify.register(workflowExecutorPlugin);
  fastify.register(schedulerPlugin, {
    enabled: opts.schedulerEnabled,
    intervalMs: opts.schedulerTickIntervalMs,
  });
  fastify.register(desktopCorsPlugin);
  fastify.register(desktopAuthPlugin, {
    desktopSessionToken: opts.desktopSessionToken,
  });

  fastify.register(AutoLoad, {
    dir: join(__dirname, 'routes'),
    ignorePattern: /(?:^|[\\/])(?:.+\.(?:test|spec))\.[cm]?[jt]s$/,
    options: { ...opts, prefix: '/api' },
  });
};
