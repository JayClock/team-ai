import type { FastifyPluginAsync } from 'fastify';
import { createHealthPayload } from '../services/health-service';

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => createHealthPayload());
};

export default healthRoute;
