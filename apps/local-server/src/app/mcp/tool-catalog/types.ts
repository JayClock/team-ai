import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { McpToolAccess, McpToolDefinition } from '../contracts';

export interface LocalMcpToolRegistration<Schema extends z.ZodTypeAny = z.ZodTypeAny> {
  createHandler: (
    fastify: FastifyInstance,
  ) => (args: z.infer<Schema>) => Promise<Record<string, unknown>>;
  definition: McpToolDefinition;
  schema: Schema;
}

export function defineToolRegistration<Schema extends z.ZodTypeAny>(
  name: string,
  schema: Schema,
  metadata: Omit<McpToolDefinition['tool'], 'name'> & { access: McpToolAccess },
  createHandler: LocalMcpToolRegistration<Schema>['createHandler'],
): LocalMcpToolRegistration<Schema> {
  return {
    createHandler,
    definition: {
      access: metadata.access,
      tool: {
        annotations: metadata.annotations,
        description: metadata.description,
        name,
        title: metadata.title,
      },
    },
    schema,
  };
}
