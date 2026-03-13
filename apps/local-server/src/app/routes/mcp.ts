import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { ZodError, z } from 'zod';
import type { ProblemDetails } from '../errors/problem-error';
import { ProblemError } from '../errors/problem-error';
import { recordNoteEvent } from '../services/note-event-service';
import { createNote, getNoteById } from '../services/note-service';
import {
  cancelAcpSession,
  createAcpSession,
  getAcpSessionById,
  promptAcpSession,
} from '../services/acp-service';
import { listAgents } from '../services/agent-service';
import { getProjectById, listProjects } from '../services/project-service';
import { listTaskRuns } from '../services/task-run-service';
import {
  executeTask,
  getTaskById,
  listTasks,
  taskStatusValues,
  updateTaskFromMcp,
} from '../services/task-service';

const mcpAccessModeHeader = 'x-teamai-mcp-access-mode';

type McpAccessMode = 'read-only' | 'read-write';
type McpToolAccess = 'read' | 'write';

interface McpToolDefinition {
  access: McpToolAccess;
  tool: {
    annotations: {
      idempotentHint?: boolean;
      readOnlyHint: boolean;
    };
    description: string;
    inputSchema: Record<string, unknown>;
    name: string;
    title: string;
  };
}

interface McpAuditContext {
  accessMode: McpAccessMode;
  parentNoteId: string | null;
  parentSessionId: string | null;
  projectId: string | null;
  sessionId: string | null;
  taskId: string | null;
  toolAccess: McpToolAccess;
  toolName: string;
}

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

const taskStatusSchema = z.enum(taskStatusValues);

const tasksListArgsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  projectId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
  status: taskStatusSchema.optional(),
});

const taskGetArgsSchema = z.object({
  projectId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
});

const nullableStringSchema = z.union([z.string().trim().min(1), z.null()]);
const stringArraySchema = z.array(z.string().trim().min(1));
const noteSourceSchema = z.enum(['user', 'agent', 'system']);
const noteTypeSchema = z.enum(['spec', 'task', 'general']);
const mcpWritableTaskStatusSchema = z.enum([
  'PENDING',
  'READY',
  'WAITING_RETRY',
  'CANCELLED',
]);
const taskRunStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
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
  .refine((input) => {
    const { projectId, taskId, ...patch } = input;
    void projectId;
    void taskId;
    return Object.keys(patch).length > 0;
  }, 'At least one task field must be provided');

const taskExecuteArgsSchema = z.object({
  projectId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
});

const taskRunsListArgsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  projectId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
  status: taskRunStatusSchema.optional(),
  taskId: z.string().trim().min(1).optional(),
});

const notesAppendArgsSchema = z.object({
  assignedAgentIds: stringArraySchema.optional(),
  content: z.string().min(1),
  parentNoteId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
  source: noteSourceSchema.default('agent'),
  taskId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  type: noteTypeSchema.default('general'),
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

const mcpToolDefinitions: readonly McpToolDefinition[] = [
  {
    access: 'read',
    tool: {
      annotations: {
        idempotentHint: true,
        readOnlyHint: true,
      },
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
  },
  {
    access: 'read',
    tool: {
      annotations: {
        idempotentHint: true,
        readOnlyHint: true,
      },
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
  },
  {
    access: 'read',
    tool: {
      annotations: {
        idempotentHint: true,
        readOnlyHint: true,
      },
      name: 'tasks_list',
      title: 'List Tasks',
      description: 'List project tasks available in the local desktop runtime.',
      inputSchema: {
        type: 'object',
        required: ['projectId'],
        properties: {
          projectId: { type: 'string' },
          sessionId: { type: 'string' },
          status: { type: 'string', enum: taskStatusValues },
          page: { type: 'number', minimum: 1, default: 1 },
          pageSize: { type: 'number', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  },
  {
    access: 'read',
    tool: {
      annotations: {
        idempotentHint: true,
        readOnlyHint: true,
      },
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
  },
  {
    access: 'write',
    tool: {
      annotations: {
        readOnlyHint: false,
      },
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
  },
  {
    access: 'write',
    tool: {
      annotations: {
        readOnlyHint: false,
      },
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
  },
  {
    access: 'read',
    tool: {
      annotations: {
        idempotentHint: true,
        readOnlyHint: true,
      },
      name: 'task_runs_list',
      title: 'List Task Runs',
      description:
        'List project task runs, with optional task, session, and status filters.',
      inputSchema: {
        type: 'object',
        required: ['projectId'],
        properties: {
          projectId: { type: 'string' },
          taskId: { type: 'string' },
          sessionId: { type: 'string' },
          status: {
            type: 'string',
            enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'],
          },
          page: { type: 'number', minimum: 1, default: 1 },
          pageSize: { type: 'number', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  },
  {
    access: 'write',
    tool: {
      annotations: {
        readOnlyHint: false,
      },
      name: 'notes_append',
      title: 'Append Note',
      description:
        'Append a new note to a project. sessionId scopes the note to a session, taskId links it to a task, and providing both keeps session ownership while linking the task.',
      inputSchema: {
        type: 'object',
        required: ['projectId', 'title', 'content'],
        properties: {
          projectId: {
            type: 'string',
            description: 'Owning project id for the new note.',
          },
          title: { type: 'string' },
          content: { type: 'string' },
          type: {
            type: 'string',
            enum: ['spec', 'task', 'general'],
            default: 'general',
          },
          source: {
            type: 'string',
            enum: ['user', 'agent', 'system'],
            default: 'agent',
          },
          sessionId: {
            type: 'string',
            description:
              'Optional session scope. When provided, the note is stored under the session note collection.',
          },
          taskId: {
            type: 'string',
            description:
              'Optional task link. This associates the note with a task without changing ownership unless sessionId is also set.',
          },
          parentNoteId: { type: 'string' },
          assignedAgentIds: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  },
  {
    access: 'write',
    tool: {
      annotations: {
        readOnlyHint: false,
      },
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
  },
  {
    access: 'write',
    tool: {
      annotations: {
        readOnlyHint: false,
      },
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
  },
  {
    access: 'write',
    tool: {
      annotations: {
        readOnlyHint: false,
      },
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
  data?: Record<string, unknown>,
) {
  return {
    jsonrpc: '2.0' as const,
    id: id ?? null,
    result: null,
    error: {
      code,
      ...(data ? { data } : {}),
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

function buildProblem(input: ProblemDetails): ProblemDetails {
  return input;
}

function buildZodProblem(error: ZodError, instance: string): ProblemDetails {
  return buildProblem({
    type: 'https://team-ai.dev/problems/invalid-request',
    title: 'Invalid Request',
    status: 400,
    detail: error.issues
      .map(({ message, path }) => `${path.join('.') || 'request'}: ${message}`)
      .join('; '),
    instance,
  });
}

function buildProblemFromError(
  error: unknown,
  instance: string,
): {
  code: number;
  problem: ProblemDetails;
} {
  if (error instanceof ZodError) {
    return {
      code: -32602,
      problem: buildZodProblem(error, instance),
    };
  }

  if (error instanceof ProblemError) {
    return {
      code: -32000,
      problem: buildProblem({
        type: error.type,
        title: error.title,
        status: error.status,
        detail: error.message,
        instance,
      }),
    };
  }

  const statusCode =
    typeof (error as { statusCode?: unknown })?.statusCode === 'number' &&
    (error as { statusCode: number }).statusCode >= 400
      ? (error as { statusCode: number }).statusCode
      : 500;

  return {
    code: -32000,
    problem: buildProblem({
      type: 'about:blank',
      title: statusCode >= 500 ? 'Internal Server Error' : 'Request Error',
      status: statusCode,
      detail: error instanceof Error ? error.message : 'MCP request failed',
      instance,
    }),
  };
}

function problemErrorEnvelope(
  id: string | number | null | undefined,
  code: number,
  problem: ProblemDetails,
) {
  return errorEnvelope(id, code, problem.detail, {
    problem,
  });
}

function buildUnknownToolProblem(
  name: string,
  instance: string,
): ProblemDetails {
  return buildProblem({
    type: 'https://team-ai.dev/problems/mcp-tool-not-found',
    title: 'MCP Tool Not Found',
    status: 404,
    detail: `Unknown tool: ${name}`,
    instance,
  });
}

function buildMethodNotFoundProblem(
  method: string,
  instance: string,
): ProblemDetails {
  return buildProblem({
    type: 'https://team-ai.dev/problems/mcp-method-not-found',
    title: 'MCP Method Not Found',
    status: 404,
    detail: `Method not found: ${method}`,
    instance,
  });
}

function buildStringArgument(
  argumentsRecord: Record<string, unknown>,
  key: string,
): string | null {
  const value = argumentsRecord[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function buildAuditContext(
  toolDefinition: McpToolDefinition,
  argumentsRecord: Record<string, unknown>,
  accessMode: McpAccessMode,
): McpAuditContext {
  return {
    accessMode,
    parentNoteId: buildStringArgument(argumentsRecord, 'parentNoteId'),
    parentSessionId: buildStringArgument(argumentsRecord, 'parentSessionId'),
    projectId: buildStringArgument(argumentsRecord, 'projectId'),
    sessionId: buildStringArgument(argumentsRecord, 'sessionId'),
    taskId: buildStringArgument(argumentsRecord, 'taskId'),
    toolAccess: toolDefinition.access,
    toolName: toolDefinition.tool.name,
  };
}

function logToolAudit(
  request: FastifyRequest,
  phase: 'attempt' | 'success' | 'failure',
  context: McpAuditContext,
  problem?: ProblemDetails,
) {
  const payload = {
    accessMode: context.accessMode,
    event: 'mcp.tool.audit',
    parentNoteId: context.parentNoteId,
    parentSessionId: context.parentSessionId,
    phase,
    problem: problem
      ? {
          detail: problem.detail,
          status: problem.status,
          title: problem.title,
          type: problem.type,
        }
      : undefined,
    projectId: context.projectId,
    sessionId: context.sessionId,
    taskId: context.taskId,
    toolAccess: context.toolAccess,
    toolName: context.toolName,
  };

  if (phase === 'failure') {
    request.log.warn(payload, 'MCP tool audit failure');
    return;
  }

  if (context.toolAccess === 'write') {
    request.log.info(payload, 'MCP tool audit');
  }
}

function getVisibleTools(accessMode: McpAccessMode) {
  return mcpToolDefinitions
    .filter((toolDefinition) => {
      return accessMode === 'read-write' || toolDefinition.access === 'read';
    })
    .map((toolDefinition) => toolDefinition.tool);
}

function findTool(name: string) {
  return mcpToolDefinitions.find((tool) => tool.tool.name === name);
}

function resolveAccessMode(request: FastifyRequest): McpAccessMode {
  const headerValue = request.headers[mcpAccessModeHeader];

  if (headerValue === undefined) {
    return 'read-only';
  }

  if (typeof headerValue !== 'string') {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/mcp-access-mode-invalid',
      title: 'MCP Access Mode Invalid',
      status: 400,
      detail: `${mcpAccessModeHeader} must be read-only or read-write`,
    });
  }

  const normalized = headerValue.trim().toLowerCase();
  if (normalized === 'read-only' || normalized === 'read-write') {
    return normalized;
  }

  throw new ProblemError({
    type: 'https://team-ai.dev/problems/mcp-access-mode-invalid',
    title: 'MCP Access Mode Invalid',
    status: 400,
    detail: `${mcpAccessModeHeader} must be read-only or read-write`,
  });
}

function ensureToolAccess(
  toolDefinition: McpToolDefinition,
  accessMode: McpAccessMode,
) {
  if (toolDefinition.access === 'read' || accessMode === 'read-write') {
    return;
  }

  throw new ProblemError({
    type: 'https://team-ai.dev/problems/mcp-write-access-required',
    title: 'MCP Write Access Required',
    status: 403,
    detail: `Tool ${toolDefinition.tool.name} requires ${mcpAccessModeHeader}: read-write`,
  });
}

function throwProjectBoundaryViolation(
  projectId: string,
  resourceType: 'note' | 'session',
  resourceId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/mcp-project-boundary-violation',
    title: 'MCP Project Boundary Violation',
    status: 409,
    detail: `MCP tool cannot access ${resourceType} ${resourceId} outside project ${projectId}`,
  });
}

async function getProjectSession(
  sqlite: Parameters<typeof getAcpSessionById>[0],
  projectId: string,
  sessionId: string,
) {
  const session = await getAcpSessionById(sqlite, sessionId);

  if (session.project.id !== projectId) {
    throwProjectBoundaryViolation(projectId, 'session', sessionId);
  }

  return session;
}

async function getProjectNote(
  sqlite: Parameters<typeof getNoteById>[0],
  projectId: string,
  noteId: string,
) {
  const note = await getNoteById(sqlite, noteId);

  if (note.projectId !== projectId) {
    throwProjectBoundaryViolation(projectId, 'note', noteId);
  }

  return note;
}

async function ensureDependencyTasksBelongToProject(
  sqlite: Parameters<typeof getTaskById>[0],
  projectId: string,
  dependencyIds: string[] | undefined,
) {
  const uniqueDependencyIds = [
    ...new Set(
      (dependencyIds ?? [])
        .map((dependencyId) => dependencyId.trim())
        .filter((dependencyId) => dependencyId.length > 0),
    ),
  ];

  await Promise.all(
    uniqueDependencyIds.map((dependencyId) =>
      getProjectTask(sqlite, projectId, dependencyId),
    ),
  );
}

function toolResult(
  request: FastifyRequest,
  id: string | number | null | undefined,
  result: unknown,
  auditContext: McpAuditContext | null,
) {
  if (auditContext) {
    logToolAudit(request, 'success', auditContext);
  }

  return resultEnvelope(id, toolSuccess(result));
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

function describeNoteScope(note: {
  linkedTaskId: string | null;
  projectId: string;
  sessionId: string | null;
}) {
  return {
    ownership: note.sessionId ? ('session' as const) : ('project' as const),
    projectId: note.projectId,
    sessionId: note.sessionId,
    taskId: note.linkedTaskId,
  };
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
    let rpcRequest: z.infer<typeof mcpJsonRpcRequestSchema> | null = null;
    let auditContext: McpAuditContext | null = null;

    try {
      const accessMode = resolveAccessMode(request);
      rpcRequest = mcpJsonRpcRequestSchema.parse(request.body);
      const { id, method, params } = rpcRequest;

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
            tools: getVisibleTools(accessMode),
          });
        case 'tools/call': {
          const toolCall = toolCallParamsSchema.parse(params);
          const toolDefinition = findTool(toolCall.name);
          if (!toolDefinition) {
            return problemErrorEnvelope(
              id,
              -32602,
              buildUnknownToolProblem(toolCall.name, request.url),
            );
          }

          auditContext = buildAuditContext(
            toolDefinition,
            toolCall.arguments,
            accessMode,
          );
          ensureToolAccess(toolDefinition, accessMode);
          logToolAudit(request, 'attempt', auditContext);

          switch (toolDefinition.tool.name) {
            case 'projects_list': {
              const args = projectsListArgsSchema.parse(toolCall.arguments);
              return toolResult(
                request,
                id,
                await listProjects(fastify.sqlite, args),
                auditContext,
              );
            }
            case 'agents_list': {
              const args = agentsListArgsSchema.parse(toolCall.arguments);
              await getProjectById(fastify.sqlite, args.projectId);

              return toolResult(
                request,
                id,
                await listAgents(fastify.sqlite, args),
                auditContext,
              );
            }
            case 'tasks_list': {
              const args = tasksListArgsSchema.parse(toolCall.arguments);
              await getProjectById(fastify.sqlite, args.projectId);
              if (args.sessionId) {
                await getProjectSession(
                  fastify.sqlite,
                  args.projectId,
                  args.sessionId,
                );
              }

              return toolResult(
                request,
                id,
                await listTasks(fastify.sqlite, args),
                auditContext,
              );
            }
            case 'task_get': {
              const args = taskGetArgsSchema.parse(toolCall.arguments);
              await getProjectById(fastify.sqlite, args.projectId);

              return toolResult(
                request,
                id,
                {
                  task: await getProjectTask(
                    fastify.sqlite,
                    args.projectId,
                    args.taskId,
                  ),
                },
                auditContext,
              );
            }
            case 'task_update': {
              const args = taskUpdateArgsSchema.parse(toolCall.arguments);
              await getProjectById(fastify.sqlite, args.projectId);
              await getProjectTask(fastify.sqlite, args.projectId, args.taskId);
              await ensureDependencyTasksBelongToProject(
                fastify.sqlite,
                args.projectId,
                args.dependencies,
              );
              const { projectId, taskId, ...patch } = args;
              void projectId;

              return toolResult(
                request,
                id,
                {
                  task: await updateTaskFromMcp(fastify.sqlite, taskId, patch),
                },
                auditContext,
              );
            }
            case 'task_execute': {
              const args = taskExecuteArgsSchema.parse(toolCall.arguments);
              await getProjectById(fastify.sqlite, args.projectId);
              await getProjectTask(fastify.sqlite, args.projectId, args.taskId);

              return toolResult(
                request,
                id,
                await executeTask(fastify.sqlite, args.taskId, {
                  callbacks: dispatchCallbacks,
                }),
                auditContext,
              );
            }
            case 'task_runs_list': {
              const args = taskRunsListArgsSchema.parse(toolCall.arguments);
              await getProjectById(fastify.sqlite, args.projectId);
              if (args.taskId) {
                await getProjectTask(
                  fastify.sqlite,
                  args.projectId,
                  args.taskId,
                );
              }
              if (args.sessionId) {
                await getProjectSession(
                  fastify.sqlite,
                  args.projectId,
                  args.sessionId,
                );
              }

              return toolResult(
                request,
                id,
                await listTaskRuns(fastify.sqlite, args),
                auditContext,
              );
            }
            case 'notes_append': {
              const args = notesAppendArgsSchema.parse(toolCall.arguments);
              await getProjectById(fastify.sqlite, args.projectId);
              if (args.taskId) {
                await getProjectTask(
                  fastify.sqlite,
                  args.projectId,
                  args.taskId,
                );
              }
              if (args.sessionId) {
                await getProjectSession(
                  fastify.sqlite,
                  args.projectId,
                  args.sessionId,
                );
              }
              if (args.parentNoteId) {
                await getProjectNote(
                  fastify.sqlite,
                  args.projectId,
                  args.parentNoteId,
                );
              }

              const note = await createNote(fastify.sqlite, {
                assignedAgentIds: args.assignedAgentIds,
                content: args.content,
                linkedTaskId: args.taskId,
                parentNoteId: args.parentNoteId,
                projectId: args.projectId,
                sessionId: args.sessionId,
                source: args.source,
                title: args.title,
                type: args.type,
              });
              await recordNoteEvent(fastify.sqlite, {
                note,
                type: 'created',
              });

              return toolResult(
                request,
                id,
                {
                  note,
                  scope: describeNoteScope(note),
                },
                auditContext,
              );
            }
            case 'acp_session_create': {
              const args = createAcpSessionArgsSchema.parse(toolCall.arguments);
              await getProjectById(fastify.sqlite, args.projectId);
              if (args.parentSessionId) {
                await getProjectSession(
                  fastify.sqlite,
                  args.projectId,
                  args.parentSessionId,
                );
              }

              return toolResult(
                request,
                id,
                {
                  session: await createAcpSession(
                    fastify.sqlite,
                    fastify.acpStreamBroker,
                    fastify.acpRuntime,
                    args,
                  ),
                },
                auditContext,
              );
            }
            case 'acp_session_prompt': {
              const args = promptAcpSessionArgsSchema.parse(toolCall.arguments);
              await getProjectById(fastify.sqlite, args.projectId);
              await getProjectSession(
                fastify.sqlite,
                args.projectId,
                args.sessionId,
              );

              return toolResult(
                request,
                id,
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
                auditContext,
              );
            }
            case 'acp_session_cancel': {
              const args = cancelAcpSessionArgsSchema.parse(toolCall.arguments);
              await getProjectById(fastify.sqlite, args.projectId);
              await getProjectSession(
                fastify.sqlite,
                args.projectId,
                args.sessionId,
              );

              return toolResult(
                request,
                id,
                {
                  session: await cancelAcpSession(
                    fastify.sqlite,
                    fastify.acpStreamBroker,
                    fastify.acpRuntime,
                    args.projectId,
                    args.sessionId,
                    args.reason,
                  ),
                },
                auditContext,
              );
            }
            default:
              return problemErrorEnvelope(
                id,
                -32601,
                buildMethodNotFoundProblem(toolCall.name, request.url),
              );
          }
        }
        default:
          return problemErrorEnvelope(
            id,
            -32601,
            buildMethodNotFoundProblem(method, request.url),
          );
      }
    } catch (error) {
      const { code, problem } = buildProblemFromError(error, request.url);
      if (auditContext) {
        logToolAudit(request, 'failure', auditContext, problem);
      }

      return problemErrorEnvelope(rpcRequest?.id, code, problem);
    }
  });
};

export default mcpRoute;
