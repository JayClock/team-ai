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

function resolveAllowHeaders(
  requestedHeaders?: string | string[],
): string {
  if (typeof requestedHeaders === 'string' && requestedHeaders.length > 0) {
    return requestedHeaders;
  }

  if (Array.isArray(requestedHeaders) && requestedHeaders.length > 0) {
    return requestedHeaders.join(', ');
  }

  return allowedHeaders.join(', ');
}

export function resolveDesktopCorsHeaders(
  origin?: string | string[],
  requestedHeaders?: string | string[],
): Record<string, string> {
  const normalizedOrigin =
    typeof origin === 'string'
      ? origin
      : Array.isArray(origin)
        ? origin[0]
        : undefined;
  const allowedOrigin = resolveAllowedOrigin(normalizedOrigin);

  if (!allowedOrigin) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': resolveAllowHeaders(requestedHeaders),
    'Access-Control-Allow-Methods': allowedMethods.join(', '),
    Vary: 'Origin, Access-Control-Request-Headers',
  };
}

const desktopCorsPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const corsHeaders = resolveDesktopCorsHeaders(
      request.headers.origin,
      request.headers['access-control-request-headers'],
    );

    for (const [name, value] of Object.entries(corsHeaders)) {
      reply.header(name, value);
    }

    if (request.method === 'OPTIONS') {
      reply.code(204).send();
    }
  });
};

export default fp(desktopCorsPlugin, {
  name: 'desktop-cors',
});
