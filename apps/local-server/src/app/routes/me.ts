import type { FastifyPluginAsync } from 'fastify';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const localUser = {
  id: 'desktop-user',
  name: 'Desktop User',
  email: 'desktop@team-ai.local',
};

const meRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/me', async (_request, reply) => {
    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.user);

    return {
      _links: {
        self: {
          href: '/api/me',
        },
        projects: {
          href: '/api/projects',
        },
      },
      ...localUser,
    };
  });
};

export default meRoute;
