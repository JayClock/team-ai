import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { URL } from 'node:url';
import { ProblemError } from '../errors/problem-error';

export const desktopSessionHeader = 'x-desktop-session';
const authorizationHeader = 'authorization';

interface DesktopAuthOptions {
  desktopSessionToken?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    desktopSessionToken: string;
  }
}

const desktopAuthPlugin: FastifyPluginAsync<DesktopAuthOptions> = async (
  fastify,
  options,
) => {
  const desktopSessionToken =
    options.desktopSessionToken ?? process.env.DESKTOP_SESSION_TOKEN;

  if (!desktopSessionToken) {
    throw new Error('Missing DESKTOP_SESSION_TOKEN for local server');
  }

  fastify.decorate('desktopSessionToken', desktopSessionToken);

  fastify.addHook('onRequest', async (request) => {
    if (request.method === 'OPTIONS') {
      return;
    }

    const providedToken = request.headers[desktopSessionHeader];
    const authorization = request.headers[authorizationHeader];
    const bearerToken =
      typeof authorization === 'string' &&
      authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : null;
    const queryToken =
      request.method === 'GET'
        ? new URL(request.url, 'http://localhost').searchParams.get(
            'desktopSessionToken',
          )
        : null;

    if (
      providedToken === desktopSessionToken ||
      bearerToken === desktopSessionToken ||
      queryToken === desktopSessionToken
    ) {
      return;
    }

    throw new ProblemError({
      type: 'https://team-ai.dev/problems/desktop-session-required',
      title: 'Desktop Session Required',
      status: 401,
      detail: 'Missing or invalid desktop session token',
    });
  });
};

export default fp(desktopAuthPlugin, {
  name: 'desktop-auth',
});
