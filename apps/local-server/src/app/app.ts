import * as path from 'path';
import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import AutoLoad from '@fastify/autoload';

export type AppOptions = FastifyPluginOptions;

export const app: FastifyPluginAsync<AppOptions> = async (fastify, opts) => {
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'plugins'),
    options: { ...opts },
  });

  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'routes'),
    options: { ...opts, prefix: '/api' },
  });
};
