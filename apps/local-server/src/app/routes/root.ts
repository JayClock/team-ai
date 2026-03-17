import type { FastifyPluginAsync } from 'fastify';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const rootRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (_request, reply) => {
    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.root);

    return {
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
        flows: {
          href: '/api/projects/{projectId}/flows',
          templated: true,
        },
        providers: {
          href: '/api/providers',
        },
        'sync-status': {
          href: '/api/sync/status',
        },
      },
    };
  });
};

export default rootRoute;
