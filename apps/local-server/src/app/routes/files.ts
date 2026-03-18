import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { searchRepositoryFiles } from '../services/file-search-service';

const fileSearchQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().optional(),
  repoPath: z.string().trim().min(1),
});

const filesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/files/search', async (request, reply) => {
    const query = fileSearchQuerySchema.parse(request.query);

    reply.header('Cache-Control', 'no-store');

    return searchRepositoryFiles({
      limit: query.limit,
      query: query.q,
      repoPath: query.repoPath,
    });
  });
};

export default filesRoute;
