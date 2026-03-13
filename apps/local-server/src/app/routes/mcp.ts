import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ProblemError } from '../errors/problem-error';
import {
  cancelAcpSession,
  createAcpSession,
  promptAcpSession,
} from '../services/acp-service';
import { listAgents } from '../services/agent-service';
import { listProjects } from '../services/project-service';
import {
  executeTask,
  getTaskById,
  listTasks,
  updateTaskFromMcp,
} from '../services/task-service';

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
  repoPath: z.string().trim().min(1).optional(),
  sourceUrl: z.string().trim().min(1).optional(),
});

const agentsListArgsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  projectId: z.string().trim().min(1),
});

const tasksListArgsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  projectId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
});

const taskGetArgsSchema = z.object({
  projectId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
});

const nullableStringSchema = z.union([z.string().trim().min(1), z.null()]);
const stringArraySchema = z.array(z.string().trim().min(1));
const mcpWritableTaskStatusSchema = z.enum([
  'PENDING',
  'READY',
  'WAITING_RETRY',
  'CANCELLED',
]);

const taskUpdateArgsSchema = z
  .object({
    acceptanceCriteria: stringArraySchema.optional(),
    assignedProvider: nullableStringSchema.optional(),
    assignedRole: nullableStringSchema.optional(),
    assignedSpecialistId: nullableStringSchema.optional(),
    assignedSpecialistName: nullableStringSchema.optional(),
    completionSummary: nullableStringSchema.optional(),
    dependencies: stringArraySchema.optional(),
    labels: stringArraySchema.optional(),
    objective: z.string().trim().min(1).optional(),
    priority: nullableStringSchema.optional(),
    projectId: z.string().trim().min(1),
    scope: nullableStringSchema.optional(),
    status: mcpWritableTaskStatusSchema.optional(),
    taskId: z.string().trim().min(1),
    title: z.string().trim().min(1).optional(),
    verificationCommands: stringArraySchema.optional(),
    verificationReport: nullableStringSchema.optional(),
    verificationVerdict: nullableStringSchema.optional(),
  })
  .refine(({ projectId: _projectId, taskId: _taskId, ...patch }) => {
    return Object.keys(patch).length > 0;
  }, 'At least one task field must be provided');

const taskExecuteArgsSchema = z.object({
  projectId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
});

const createAcpSessionArgsSchema = z.object({
  actorUserId: z.string().trim().min(1),
  goal: z.string().trim().min(1).optional(),
  parentSessionId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1),
  provider: z.string().trim().min(1).default('codex'),
  role: z.string().trim().min(1).optional(),
  specialistId: z.string().trim().min(1).optional(),
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

const mcpTools = [
  {
    name: 'projects_list',
    title: 'List Projects',
    description:
      'List local desktop projects available in the current workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', minimum: 1, default: 1 },
        pageSize: { type: 'number', minimum: 1, maximum: 100, default: 20 },
        q: { type: 'string' },
        repoPath: { type: 'string' },
        sourceUrl: { type: 'string' },
      },
    },
  },
  {
    name: 'agents_list',
    title: 'List Agents',
    description:
      'List local agent profiles available for a project in the desktop runtime.',
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string' },
        page: { type: 'number', minimum: 1, default: 1 },
        pageSize: { type: 'number', minimum: 1, maximum: 100, default: 20 },
      },
    },
  },
  {
    name: 'tasks_list',
    title: 'List Tasks',
    description: 'List project tasks available in the local desktop runtime.',
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string' },
        sessionId: { type: 'string' },
        status: { type: 'string' },
        page: { type: 'number', minimum: 1, default: 1 },
        pageSize: { type: 'number', minimum: 1, maximum: 100, default: 20 },
      },
    },
  },
  {
    name: 'task_get',
    title: 'Get Task',
    description:
      'Get a single project task by id from the local desktop runtime.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'taskId'],
      properties: {
        projectId: { type: 'string' },
        taskId: { type: 'string' },
      },
    },
  },
  {
    name: 'task_update',
    title: 'Update Task',
    description:
      'Update safe task fields and controlled task statuses in the local desktop runtime.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'taskId'],
      properties: {
        projectId: { type: 'string' },
        taskId: { type: 'string' },
        title: { type: 'string' },
        objective: { type: 'string' },
        scope: { type: ['string', 'null'] },
        priority: { type: ['string', 'null'] },
        assignedProvider: { type: ['string', 'null'] },
        assignedRole: { type: ['string', 'null'] },
        assignedSpecialistId: { type: ['string', 'null'] },
        assignedSpecialistName: { type: ['string', 'null'] },
        acceptanceCriteria: {
          type: 'array',
          items: { type: 'string' },
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
        },
        verificationCommands: {
          type: 'array',
          items: { type: 'string' },
        },
        completionSummary: { type: ['string', 'null'] },
        verificationReport: { type: ['string', 'null'] },
        verificationVerdict: { type: ['string', 'null'] },
        status: {
          type: 'string',
          enum: ['PENDING', 'READY', 'WAITING_RETRY', 'CANCELLED'],
        },
      },
    },
  },
  {
    name: 'task_execute',
    title: 'Execute Task',
    description:
      'Move a task into execution and trigger dispatch in the local desktop runtime.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'taskId'],
      properties: {
        projectId: { type: 'string' },
        taskId: { type: 'string' },
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
        role: { type: 'string' },
        parentSessionId: { type: 'string' },
        specialistId: { type: 'string' },
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
] as const;

function resultEnvelope(
  id: string | number | null | undefined,
  result: object,
) {
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

async function getProjectTask(
  sqlite: Parameters<typeof getTaskById>[0],
  projectId: string,
  taskId: string,
) {
  const task = await getTaskById(sqlite, taskId);

  if (task.projectId !== projectId) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/task-project-mismatch',
      title: 'Task Project Mismatch',
      status: 409,
      detail: `Task ${taskId} does not belong to project ${projectId}`,
    });
  }

  return task;
}

const mcpRoute: FastifyPluginAsync = async (fastify) => {
  const dispatchCallbacks = {
    async createSession(input: {
      actorUserId: string;
      goal?: string;
      parentSessionId?: string | null;
      projectId: string;
      provider: string;
      retryOfRunId?: string | null;
      role?: string | null;
      specialistId?: string;
      taskId?: string | null;
    }) {
      const session = await createAcpSession(
        fastify.sqlite,
        fastify.acpStreamBroker,
        fastify.acpRuntime,
        input,
      );

      return {
        id: session.id,
      };
    },
    async promptSession(input: {
      projectId: string;
      prompt: string;
      sessionId: string;
    }) {
      return await promptAcpSession(
        fastify.sqlite,
        fastify.acpStreamBroker,
        fastify.acpRuntime,
        input.projectId,
        input.sessionId,
        {
          prompt: input.prompt,
        },
      );
    },
  };

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
            case 'tasks_list': {
              const args = tasksListArgsSchema.parse(toolCall.arguments);
              return resultEnvelope(
                id,
                toolSuccess(await listTasks(fastify.sqlite, args)),
              );
            }
            case 'task_get': {
              const args = taskGetArgsSchema.parse(toolCall.arguments);
              return resultEnvelope(
                id,
                toolSuccess({
                  task: await getProjectTask(
                    fastify.sqlite,
                    args.projectId,
                    args.taskId,
                  ),
                }),
              );
            }
            case 'task_update': {
              const args = taskUpdateArgsSchema.parse(toolCall.arguments);
              await getProjectTask(fastify.sqlite, args.projectId, args.taskId);
              const { projectId: _projectId, taskId, ...patch } = args;

              return resultEnvelope(
                id,
                toolSuccess({
                  task: await updateTaskFromMcp(fastify.sqlite, taskId, patch),
                }),
              );
            }
            case 'task_execute': {
              const args = taskExecuteArgsSchema.parse(toolCall.arguments);
              await getProjectTask(fastify.sqlite, args.projectId, args.taskId);

              return resultEnvelope(
                id,
                toolSuccess(
                  await executeTask(fastify.sqlite, args.taskId, {
                    callbacks: dispatchCallbacks,
                  }),
                ),
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
                    fastify.acpRuntime,
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
                    fastify.acpRuntime,
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
                    fastify.acpRuntime,
                    args.projectId,
                    args.sessionId,
                    args.reason,
                  ),
                }),
              );
            }
            default:
              return errorEnvelope(
                id,
                -32601,
                `Unhandled tool: ${toolCall.name}`,
              );
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
