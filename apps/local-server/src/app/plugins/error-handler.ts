import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    const status =
      typeof error.statusCode === 'number' && error.statusCode >= 400
        ? error.statusCode
        : 500;

    reply
      .code(status)
      .type('application/problem+json')
      .send({
        type: 'about:blank',
        title: status >= 500 ? 'Internal Server Error' : 'Request Error',
        status,
        detail: error.message,
        instance: request.url,
      });
  });

  fastify.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.code(404).type('application/problem+json').send({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: `Route ${request.method} ${request.url} was not found`,
      instance: request.url,
    });
  });
};

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
});
