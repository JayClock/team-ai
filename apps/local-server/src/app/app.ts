import { join } from 'node:path';
import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import AutoLoad from '@fastify/autoload';
import desktopAuthPlugin from './plugins/desktop-auth';
import problemJsonPlugin from './plugins/problem-json';
import sensiblePlugin from './plugins/sensible';

export interface AppOptions extends FastifyPluginOptions {
  desktopSessionToken?: string;
}

export const app: FastifyPluginAsync<AppOptions> = async (fastify, opts) => {
  fastify.register(problemJsonPlugin);
  fastify.register(sensiblePlugin);
  fastify.register(desktopAuthPlugin, {
    desktopSessionToken: opts.desktopSessionToken,
  });

  fastify.register(AutoLoad, {
    dir: join(__dirname, 'routes'),
    options: { ...opts, prefix: '/api' },
  });
};
