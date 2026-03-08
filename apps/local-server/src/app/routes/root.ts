import type { FastifyPluginAsync } from 'fastify';

const rootRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({
    name: 'team-ai-local-server',
    capabilities: {
      health: true,
    },
    _links: {
      self: {
        href: '/api',
      },
      health: {
        href: '/api/health',
      },
    },
  }));
};

export default rootRoute;
