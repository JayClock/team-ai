import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { ZodError } from 'zod';
import { getErrorDiagnostics } from '../diagnostics';
import type { ProblemDetails } from '../errors/problem-error';
import { ProblemError, problemTypeToCode } from '../errors/problem-error';
import { getNoteById } from '../services/note-service';
import {
  ensureRoleValue,
  getDefaultSpecialistByRole,
  getSpecialistById,
} from '../services/specialist-service';
import { getAcpSessionById } from '../services/acp-service';
import { getProjectById } from '../services/project-service';
import { getTaskById } from '../services/task-service';
import {
  mcpAccessModeHeader,
  mcpRoutePath,
  mcpSessionHeader,
  type McpAccessMode,
  type McpAuditContext,
  type McpToolDefinition,
} from './contracts';

function buildProblem(input: ProblemDetails): ProblemDetails {
  return {
    ...input,
    code:
      input.code ??
      problemTypeToCode(
        input.type,
        input.status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
      ),
  };
}

export function buildAuditProblemContext(
  context: McpAuditContext | null,
): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }

  return {
    accessMode: context.accessMode,
    argumentKeys: context.argumentKeys,
    mutationKeys: context.mutationKeys,
    parentNoteId: context.parentNoteId,
    parentSessionId: context.parentSessionId,
    projectId: context.projectId,
    sessionId: context.sessionId,
    taskId: context.taskId,
    toolAccess: context.toolAccess,
    toolName: context.toolName,
  };
}

function mergeProblemContext(
  problem: ProblemDetails,
  context: Record<string, unknown> | undefined,
): ProblemDetails {
  if (!context) {
    return problem;
  }

  return {
    ...problem,
    context: {
      ...(problem.context ?? {}),
      ...context,
    },
  };
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
    context: {
      issueCount: error.issues.length,
    },
  });
}

export function buildProblemFromError(
  error: unknown,
  instance: string,
  context?: Record<string, unknown>,
): {
  code: number;
  problem: ProblemDetails;
} {
  if (error instanceof ZodError) {
    return {
      code: -32602,
      problem: mergeProblemContext(buildZodProblem(error, instance), context),
    };
  }

  if (error instanceof ProblemError) {
    return {
      code: -32000,
      problem: mergeProblemContext(
        buildProblem({
          code: error.code,
          context: error.context,
          type: error.type,
          title: error.title,
          status: error.status,
          detail: error.message,
          instance,
        }),
        context,
      ),
    };
  }

  const statusCode =
    typeof (error as { statusCode?: unknown })?.statusCode === 'number' &&
    (error as { statusCode: number }).statusCode >= 400
      ? (error as { statusCode: number }).statusCode
      : 500;
  const diagnostics = getErrorDiagnostics(
    error,
    statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
  );

  return {
    code: -32000,
    problem: mergeProblemContext(
      buildProblem({
        code: diagnostics.errorCode,
        context: diagnostics.errorContext,
        type: 'about:blank',
        title: statusCode >= 500 ? 'Internal Server Error' : 'Request Error',
        status: statusCode,
        detail: error instanceof Error ? error.message : 'MCP request failed',
        instance,
      }),
      context,
    ),
  };
}

function buildStringArgument(
  argumentsRecord: Record<string, unknown>,
  key: string,
): string | null {
  const value = argumentsRecord[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function buildAuditContext(
  toolDefinition: McpToolDefinition,
  argumentsRecord: Record<string, unknown>,
  accessMode: McpAccessMode,
): McpAuditContext {
  return {
    accessMode,
    argumentKeys: Object.keys(argumentsRecord).sort(),
    mutationKeys: extractMutationKeys(
      toolDefinition.tool.name,
      argumentsRecord,
    ),
    parentNoteId: buildStringArgument(argumentsRecord, 'parentNoteId'),
    parentSessionId: buildStringArgument(argumentsRecord, 'parentSessionId'),
    projectId: buildStringArgument(argumentsRecord, 'projectId'),
    sessionId: buildStringArgument(argumentsRecord, 'sessionId'),
    taskId: buildStringArgument(argumentsRecord, 'taskId'),
    toolAccess: toolDefinition.access,
    toolName: toolDefinition.tool.name,
  };
}

function extractMutationKeys(
  toolName: string,
  argumentsRecord: Record<string, unknown>,
) {
  if (toolName === 'task_execute') {
    return ['execute'];
  }

  const ignoredKeys = new Set([
    'actorUserId',
    'parentNoteId',
    'parentSessionId',
    'projectId',
    'sessionId',
    'taskId',
  ]);

  return Object.keys(argumentsRecord)
    .filter((key) => !ignoredKeys.has(key))
    .sort();
}

export function logToolAudit(
  logger: FastifyBaseLogger,
  phase: 'attempt' | 'success' | 'failure',
  context: McpAuditContext,
  problem?: ProblemDetails,
) {
  const payload = {
    accessMode: context.accessMode,
    argumentKeys: context.argumentKeys,
    event: 'mcp.tool.audit',
    mutationKeys: context.mutationKeys,
    parentNoteId: context.parentNoteId,
    parentSessionId: context.parentSessionId,
    phase,
    problem: problem
      ? {
          code: problem.code,
          context: problem.context,
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
    logger.warn(payload, 'MCP tool audit failure');
    return;
  }

  if (context.toolAccess === 'write') {
    logger.info(payload, 'MCP tool audit');
  }
}

export function resolveAccessMode(request: FastifyRequest): McpAccessMode {
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
    context: {
      projectId,
      resourceId,
      resourceType,
    },
  });
}

export async function getProjectSession(
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

export async function getProjectNote(
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

export async function ensureDependencyTasksBelongToProject(
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

export async function getProjectTask(
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
      context: {
        projectId,
        taskId,
      },
    });
  }

  return task;
}

export function describeNoteScope(note: {
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

export async function resolveDelegationSpecialist(
  sqlite: Parameters<typeof getProjectById>[0],
  projectId: string,
  specialistValue: string,
) {
  const role = ensureRoleValue(specialistValue);
  if (role) {
    const specialist = await getDefaultSpecialistByRole(sqlite, projectId, role);
    return {
      requested: specialistValue,
      resolvedRole: role,
      specialist,
    };
  }

  const specialist = await getSpecialistById(sqlite, projectId, specialistValue);
  return {
    requested: specialistValue,
    resolvedRole: specialist.role,
    specialist,
  };
}

export function buildToolResult(result: Record<string, unknown>) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result,
  };
}

export function buildMcpError(
  error: unknown,
  auditContext: McpAuditContext | null,
) {
  const { code, problem } = buildProblemFromError(
    error,
    mcpRoutePath,
    buildAuditProblemContext(auditContext),
  );

  return new McpError(code, problem.detail, {
    problem,
  });
}

export function readSessionIdHeader(request: FastifyRequest): string | undefined {
  const headerValue = request.headers[mcpSessionHeader];

  if (Array.isArray(headerValue)) {
    return headerValue[0]?.trim() || undefined;
  }

  if (typeof headerValue === 'string') {
    return headerValue.trim() || undefined;
  }

  return undefined;
}

export function isInitializeRequestBody(
  body: unknown,
): body is {
  jsonrpc: '2.0';
  method: 'initialize';
  params: Record<string, unknown>;
} {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as { jsonrpc?: unknown; method?: unknown };
  return candidate.jsonrpc === '2.0' && candidate.method === 'initialize';
}

export function setMcpCorsHeaders(reply: FastifyReply) {
  reply.raw.setHeader('Access-Control-Allow-Origin', '*');
  reply.raw.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  reply.raw.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID',
  );
  reply.raw.setHeader(
    'Access-Control-Expose-Headers',
    'Mcp-Session-Id, MCP-Protocol-Version',
  );
}
