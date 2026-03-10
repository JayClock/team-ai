import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  cancelAcpSession,
  createAcpSession,
  promptAcpSession,
} from '../services/acp-service';
import { listAgents } from '../services/agent-service';
import { createOrchestrationSession } from '../services/orchestration-service';
import { listProjects } from '../services/project-service';

const mcpJsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).nullable().optional(),
  method: z.string().trim().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
});

const toolCallParamsSchema = z.object({
  name: z.string().trim().min(1),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

const projectsListArgsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().trim().min(1).optional(),
  sourceUrl: z.string().trim().min(1).optional(),
  workspaceRoot: z.string().trim().min(1).optional(),
});

const agentsListArgsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const createAcpSessionArgsSchema = z.object({
  actorUserId: z.string().trim().min(1),
  goal: z.string().trim().min(1).optional(),
  mode: z.string().trim().min(1).default('CHAT'),
  parentSessionId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1),
  provider: z.string().trim().min(1).default('codex'),
});

const promptAcpSessionArgsSchema = z.object({
  eventId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  timeoutMs: z.coerce.number().int().positive().optional(),
  traceId: z.string().trim().min(1).optional(),
});

const cancelAcpSessionArgsSchema = z.object({
  projectId: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1),
});

const createOrchestrationSessionArgsSchema = z.object({
  executionMode: z.enum(['ROUTA', 'DEVELOPER']).optional(),
  goal: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  provider: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  traceId: z.string().trim().min(1).optional(),
  workspaceRoot: z.string().trim().min(1).optional(),
});

const mcpTools = [
  {
    name: 'projects_list',
    title: 'List Projects',
    description: 'List local desktop projects available in the current workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', minimum: 1, default: 1 },
        pageSize: { type: 'number', minimum: 1, maximum: 100, default: 20 },
        q: { type: 'string' },
        sourceUrl: { type: 'string' },
        workspaceRoot: { type: 'string' },
      },
    },
  },
  {
    name: 'agents_list',
    title: 'List Agents',
    description: 'List local agent profiles available in the desktop runtime.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', minimum: 1, default: 1 },
        pageSize: { type: 'number', minimum: 1, maximum: 100, default: 20 },
      },
    },
  },
  {
    name: 'acp_session_create',
    title: 'Create ACP Session',
    description: 'Create a new local ACP session for a project.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'actorUserId'],
      properties: {
        projectId: { type: 'string' },
        actorUserId: { type: 'string' },
        provider: { type: 'string', default: 'codex' },
        mode: { type: 'string', default: 'CHAT' },
        parentSessionId: { type: 'string' },
        goal: { type: 'string' },
      },
    },
  },
  {
    name: 'acp_session_prompt',
    title: 'Prompt ACP Session',
    description: 'Send a prompt to an existing local ACP session.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'sessionId', 'prompt'],
      properties: {
        projectId: { type: 'string' },
        sessionId: { type: 'string' },
        prompt: { type: 'string' },
        timeoutMs: { type: 'number', minimum: 1 },
        eventId: { type: 'string' },
        traceId: { type: 'string' },
      },
    },
  },
  {
    name: 'acp_session_cancel',
    title: 'Cancel ACP Session',
    description: 'Cancel an active local ACP session.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'sessionId'],
      properties: {
        projectId: { type: 'string' },
        sessionId: { type: 'string' },
        reason: { type: 'string' },
      },
    },
  },
  {
    name: 'orchestration_session_create',
    title: 'Create Orchestration Session',
    description: 'Create a local orchestration session for a project goal.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'title', 'goal'],
      properties: {
        projectId: { type: 'string' },
        title: { type: 'string' },
        goal: { type: 'string' },
        provider: { type: 'string' },
        traceId: { type: 'string' },
        workspaceRoot: { type: 'string' },
        executionMode: { type: 'string', enum: ['ROUTA', 'DEVELOPER'] },
      },
    },
  },
] as const;

function resultEnvelope(id: string | number | null | undefined, result: object) {
  return {
    jsonrpc: '2.0' as const,
    id: id ?? null,
    result,
    error: null,
  };
}

function errorEnvelope(
  id: string | number | null | undefined,
  code: number,
  message: string,
) {
  return {
    jsonrpc: '2.0' as const,
    id: id ?? null,
    result: null,
    error: {
      code,
      message,
    },
  };
}

function toolSuccess(result: unknown) {
  return {
    content: [
      {
        type: 'json' as const,
        json: result,
      },
    ],
    isError: false,
  };
}

function findTool(name: string) {
  return mcpTools.find((tool) => tool.name === name);
}

const mcpRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/mcp', async (request) => {
    const rpcRequest = mcpJsonRpcRequestSchema.parse(request.body);
    const { id, method, params } = rpcRequest;

    try {
      switch (method) {
        case 'initialize':
          return resultEnvelope(id, {
            protocolVersion: '2026-03-26',
            capabilities: {
              tools: {
                listChanged: false,
              },
            },
            serverInfo: {
              name: 'team-ai-local-mcp',
              version: 'desktop',
            },
          });
        case 'tools/list':
          return resultEnvelope(id, {
            tools: mcpTools,
          });
        case 'tools/call': {
          const toolCall = toolCallParamsSchema.parse(params);
          const tool = findTool(toolCall.name);
          if (!tool) {
            return errorEnvelope(id, -32602, `Unknown tool: ${toolCall.name}`);
          }

          switch (tool.name) {
            case 'projects_list': {
              const args = projectsListArgsSchema.parse(toolCall.arguments);
              return resultEnvelope(
                id,
                toolSuccess(await listProjects(fastify.sqlite, args)),
              );
            }
            case 'agents_list': {
              const args = agentsListArgsSchema.parse(toolCall.arguments);
              return resultEnvelope(
                id,
                toolSuccess(await listAgents(fastify.sqlite, args)),
              );
            }
            case 'acp_session_create': {
              const args = createAcpSessionArgsSchema.parse(toolCall.arguments);
              return resultEnvelope(
                id,
                toolSuccess({
                  session: await createAcpSession(
                    fastify.sqlite,
                    fastify.acpStreamBroker,
                    fastify.agentGatewayClient,
                    args,
                  ),
                }),
              );
            }
            case 'acp_session_prompt': {
              const args = promptAcpSessionArgsSchema.parse(toolCall.arguments);
              return resultEnvelope(
                id,
                toolSuccess(
                  await promptAcpSession(
                    fastify.sqlite,
                    fastify.acpStreamBroker,
                    fastify.agentGatewayClient,
                    args.projectId,
                    args.sessionId,
                    {
                      prompt: args.prompt,
                      timeoutMs: args.timeoutMs,
                      eventId: args.eventId,
                      traceId: args.traceId,
                    },
                  ),
                ),
              );
            }
            case 'acp_session_cancel': {
              const args = cancelAcpSessionArgsSchema.parse(toolCall.arguments);
              return resultEnvelope(
                id,
                toolSuccess({
                  session: await cancelAcpSession(
                    fastify.sqlite,
                    fastify.acpStreamBroker,
                    fastify.agentGatewayClient,
                    args.projectId,
                    args.sessionId,
                    args.reason,
                  ),
                }),
              );
            }
            case 'orchestration_session_create': {
              const args = createOrchestrationSessionArgsSchema.parse(
                toolCall.arguments,
              );
              return resultEnvelope(
                id,
                toolSuccess(
                  await createOrchestrationSession(
                    fastify.sqlite,
                    fastify.orchestrationStreamBroker,
                    args,
                    fastify.agentGatewayClient,
                  ),
                ),
              );
            }
            default:
              return errorEnvelope(id, -32601, `Unhandled tool: ${toolCall.name}`);
          }
        }
        default:
          return errorEnvelope(id, -32601, `Method not found: ${method}`);
      }
    } catch (error) {
      return errorEnvelope(
        id,
        -32000,
        error instanceof Error ? error.message : 'MCP request failed',
      );
    }
  });
};

export default mcpRoute;
