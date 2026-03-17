import type { FastifyInstance } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAccessMode } from './contracts';
import type { LocalMcpToolRegistration } from './tool-catalog';
import { localMcpToolCatalog } from './tool-catalog';
import {
  buildAuditContext,
  buildMcpError,
  buildToolResult,
  logToolAudit,
} from './utils';

export class LocalMcpToolManager {
  constructor(
    private readonly fastify: FastifyInstance,
    private readonly accessMode: McpAccessMode,
  ) {}

  registerTools(server: McpServer) {
    for (const toolRegistration of localMcpToolCatalog) {
      this.registerTool(server, toolRegistration as LocalMcpToolRegistration);
    }
  }

  registerTool<Schema extends z.ZodTypeAny = z.ZodTypeAny>(
    server: McpServer,
    toolRegistration: LocalMcpToolRegistration<Schema>,
  ) {
    const { createHandler, definition, schema } = toolRegistration;
    const handler = createHandler(this.fastify);
    const toolDefinition = definition;
    if (this.accessMode === 'read-only' && toolDefinition.access === 'write') {
      return;
    }

    (
      server.registerTool as unknown as (
        name: string,
        definition: object,
        callback: (args: unknown) => Promise<object>,
      ) => void
    ).call(
      server,
      toolDefinition.tool.name,
      {
        annotations: toolDefinition.tool.annotations,
        description: toolDefinition.tool.description,
        inputSchema: schema,
        title: toolDefinition.tool.title,
      },
      async (args) => {
        const auditContext = buildAuditContext(
          toolDefinition,
          args as Record<string, unknown>,
          this.accessMode,
        );
        logToolAudit(this.fastify.log, 'attempt', auditContext);

        try {
          const result = await handler(args as z.infer<Schema>);
          logToolAudit(this.fastify.log, 'success', auditContext);
          return buildToolResult(result);
        } catch (error) {
          const mcpError = buildMcpError(error, auditContext);
          const problem = (
            mcpError.data as {
              problem?: import('../errors/problem-error').ProblemDetails;
            } | undefined
          )?.problem;
          if (problem) {
            logToolAudit(this.fastify.log, 'failure', auditContext, problem);
          }
          throw mcpError;
        }
      },
    );
  }
}
