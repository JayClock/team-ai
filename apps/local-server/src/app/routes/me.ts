import type { FastifyPluginAsync } from 'fastify';

const localUser = {
  id: 'desktop-user',
  name: 'Desktop User',
  email: 'desktop@team-ai.local',
};

const meRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/me', async () => ({
    _links: {
      self: {
        href: '/api/me',
      },
      projects: {
        href: '/api/projects',
      },
    },
    ...localUser,
  }));
};

export default meRoute;
