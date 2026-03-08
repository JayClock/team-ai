import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { isProblemError } from '../errors/problem-error';

const defaultProblemType = 'about:blank';

const problemJsonPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error instanceof ZodError) {
      reply.code(400).type('application/problem+json').send({
        type: 'https://team-ai.dev/problems/invalid-request',
        title: 'Invalid Request',
        status: 400,
        detail: error.issues.map(({ message, path }) => `${path.join('.') || 'request'}: ${message}`).join('; '),
        instance: request.url,
      });
      return;
    }

    if (isProblemError(error)) {
      reply.code(error.status).type('application/problem+json').send({
        type: error.type,
        title: error.title,
        status: error.status,
        detail: error.message,
        instance: request.url,
      });
      return;
    }

    const status =
      typeof error.statusCode === 'number' && error.statusCode >= 400
        ? error.statusCode
        : 500;

    reply.code(status).type('application/problem+json').send({
      type: defaultProblemType,
      title: status >= 500 ? 'Internal Server Error' : 'Request Error',
      status,
      detail: error.message,
      instance: request.url,
    });
  });

  fastify.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.code(404).type('application/problem+json').send({
      type: defaultProblemType,
      title: 'Not Found',
      status: 404,
      detail: `Route ${request.method} ${request.url} was not found`,
      instance: request.url,
    });
  });
};

export default fp(problemJsonPlugin, {
  name: 'problem-json',
});
