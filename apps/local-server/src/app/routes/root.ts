import type { FastifyPluginAsync } from 'fastify';

const rootRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({
    name: 'team-ai-local-server',
    capabilities: {
      acp: true,
      agents: true,
      health: true,
      mcp: true,
      sessions: true,
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
      mcp: {
        href: '/api/mcp',
      },
      sessions: {
        href: '/api/sessions{?projectId,status,page,pageSize}',
        templated: true,
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
