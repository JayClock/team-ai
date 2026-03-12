import type { FastifyPluginAsync } from 'fastify';

const rootRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({
    name: 'team-ai-local-server',
    capabilities: {
      acp: true,
      agents: true,
      mcp: true,
      settings: true,
      syncStatus: true,
    },
    _links: {
      self: {
        href: '/api',
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
      'acp-providers': {
        href: '/api/acp/providers{?registry}',
        templated: true,
      },
      mcp: {
        href: '/api/mcp',
      },
      agents: {
        href: '/api/projects/{projectId}/agents{?page,pageSize}',
        templated: true,
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
