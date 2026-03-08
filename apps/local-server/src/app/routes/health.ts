import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHealthPayload } from '../services/health-service';

const healthQuerySchema = z.object({
  check: z.enum(['live', 'ready']).optional(),
});

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (request) => {
    const { check } = healthQuerySchema.parse(request.query);

    return createHealthPayload(check);
  });
};

export default healthRoute;
