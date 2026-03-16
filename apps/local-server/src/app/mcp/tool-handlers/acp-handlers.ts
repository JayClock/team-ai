import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  cancelAcpSession,
  createAcpSession,
  promptAcpSession,
} from '../../services/acp-service';
import { getProjectById } from '../../services/project-service';
import {
  cancelAcpSessionArgsSchema,
  createAcpSessionArgsSchema,
  promptAcpSessionArgsSchema,
} from '../contracts';
import { getProjectSession } from '../utils';

type CreateAcpSessionArgs = z.infer<typeof createAcpSessionArgsSchema>;
type PromptAcpSessionArgs = z.infer<typeof promptAcpSessionArgsSchema>;
type CancelAcpSessionArgs = z.infer<typeof cancelAcpSessionArgsSchema>;

export function createAcpSessionCreateHandler(fastify: FastifyInstance) {
  return async (args: CreateAcpSessionArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);
    if (args.parentSessionId) {
      await getProjectSession(
        fastify.sqlite,
        args.projectId,
        args.parentSessionId,
      );
    }

    return {
      session: await createAcpSession(
        fastify.sqlite,
        fastify.acpStreamBroker,
        fastify.acpRuntime,
        args,
        {
          logger: fastify.log,
          source: 'mcp-route',
        },
      ),
    };
  };
}

export function createAcpSessionPromptHandler(fastify: FastifyInstance) {
  return async (args: PromptAcpSessionArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);
    await getProjectSession(fastify.sqlite, args.projectId, args.sessionId);

    return promptAcpSession(
      fastify.sqlite,
      fastify.acpStreamBroker,
      fastify.acpRuntime,
      args.projectId,
      args.sessionId,
      {
        eventId: args.eventId,
        prompt: args.prompt,
        timeoutMs: args.timeoutMs,
        traceId: args.traceId,
      },
      {
        logger: fastify.log,
        source: 'mcp-route',
      },
    );
  };
}

export function createAcpSessionCancelHandler(fastify: FastifyInstance) {
  return async (args: CancelAcpSessionArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);
    await getProjectSession(fastify.sqlite, args.projectId, args.sessionId);

    return {
      session: await cancelAcpSession(
        fastify.sqlite,
        fastify.acpStreamBroker,
        fastify.acpRuntime,
        args.projectId,
        args.sessionId,
        args.reason,
        {
          logger: fastify.log,
          source: 'mcp-route',
        },
      ),
    };
  };
}
