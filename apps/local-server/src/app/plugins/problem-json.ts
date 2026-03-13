import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { getErrorDiagnostics } from '../diagnostics';
import { isProblemError, problemTypeToCode } from '../errors/problem-error';

const defaultProblemType = 'about:blank';

const problemJsonPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    const diagnostics = getErrorDiagnostics(
      error,
      error instanceof ZodError ? 'INVALID_REQUEST' : 'HTTP_REQUEST_FAILED',
    );

    request.log.error(
      {
        event: 'http.request.failed',
        errorCode: diagnostics.errorCode,
        errorContext: diagnostics.errorContext,
        errorMessage: diagnostics.errorMessage,
        method: request.method,
        path: request.url,
        problemStatus: diagnostics.problemStatus,
        problemTitle: diagnostics.problemTitle,
        problemType: diagnostics.problemType,
      },
      'HTTP request failed',
    );

    if (error instanceof ZodError) {
      reply
        .code(400)
        .type('application/problem+json')
        .send({
          code: 'INVALID_REQUEST',
          type: 'https://team-ai.dev/problems/invalid-request',
          title: 'Invalid Request',
          status: 400,
          detail: error.issues
            .map(
              ({ message, path }) =>
                `${path.join('.') || 'request'}: ${message}`,
            )
            .join('; '),
          instance: request.url,
          context: {
            issueCount: error.issues.length,
          },
        });
      return;
    }

    if (isProblemError(error)) {
      reply
        .code(error.status)
        .type('application/problem+json')
        .send({
          code: error.code,
          type: error.type,
          title: error.title,
          status: error.status,
          detail: error.message,
          instance: request.url,
          ...(error.context ? { context: error.context } : {}),
        });
      return;
    }

    const status =
      typeof error.statusCode === 'number' && error.statusCode >= 400
        ? error.statusCode
        : 500;

    reply
      .code(status)
      .type('application/problem+json')
      .send({
        code: problemTypeToCode(
          defaultProblemType,
          status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
        ),
        type: defaultProblemType,
        title: status >= 500 ? 'Internal Server Error' : 'Request Error',
        status,
        detail: error.message,
        instance: request.url,
      });
  });

  fastify.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply
      .code(404)
      .type('application/problem+json')
      .send({
        code: 'NOT_FOUND',
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
