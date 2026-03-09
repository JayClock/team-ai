import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

const allowedHeaders = [
  'Accept',
  'Accept-Language',
  'Content-Type',
  'X-Api-Key',
  'X-Desktop-Session',
];

const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

function resolveAllowedOrigin(origin?: string): string | null {
  if (!origin) {
    return null;
  }

  if (origin === 'null') {
    return origin;
  }

  try {
    const url = new URL(origin);
    const isLoopbackHost =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    if (isLoopbackHost && url.port === '4200') {
      return origin;
    }
  } catch {
    return null;
  }

  return null;
}

const desktopCorsPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const allowedOrigin = resolveAllowedOrigin(request.headers.origin);
    const requestedHeaders = request.headers['access-control-request-headers'];
    const allowHeaders =
      typeof requestedHeaders === 'string' && requestedHeaders.length > 0
        ? requestedHeaders
        : allowedHeaders.join(', ');

    if (allowedOrigin) {
      reply.header('Access-Control-Allow-Origin', allowedOrigin);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Access-Control-Allow-Headers', allowHeaders);
      reply.header('Access-Control-Allow-Methods', allowedMethods.join(', '));
      reply.header('Vary', 'Origin, Access-Control-Request-Headers');
    }

    if (request.method === 'OPTIONS') {
      reply.code(204).send();
    }
  });
};

export default fp(desktopCorsPlugin, {
  name: 'desktop-cors',
});
