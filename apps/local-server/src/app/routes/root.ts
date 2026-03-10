import type { FastifyPluginAsync } from 'fastify';

const rootRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({
    name: 'team-ai-local-server',
    capabilities: {
      acp: true,
      agents: true,
      health: true,
      orchestration: true,
      settings: true,
      syncStatus: true,
    },
    _links: {
      self: {
        href: '/api',
      },
      health: {
        href: '/api/health',
      },
      settings: {
        href: '/api/settings',
      },
      projects: {
        href: '/api/projects',
      },
      me: {
        href: '/api/me',
      },
      acp: {
        href: '/api/acp',
      },
      orchestration: {
        href: '/api/orchestration',
      },
      agents: {
        href: '/api/agents',
      },
      providers: {
        href: '/api/providers',
      },
      'sync-status': {
        href: '/api/sync/status',
      },
    },
  }));
};

export default rootRoute;
