import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { ProblemError } from '../errors/problem-error';

export const desktopSessionHeader = 'x-desktop-session';

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
    const providedToken = request.headers[desktopSessionHeader];

    if (providedToken === desktopSessionToken) {
      return;
    }

    throw new ProblemError({
      type: 'https://team-ai.dev/problems/desktop-session-required',
      title: 'Desktop Session Required',
      status: 401,
      detail: 'Missing or invalid X-Desktop-Session header',
    });
  });
};

export default fp(desktopAuthPlugin, {
  name: 'desktop-auth',
});
