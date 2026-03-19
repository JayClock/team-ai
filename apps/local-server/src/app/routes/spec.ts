import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { syncSpecTasks } from '../services/spec-task-sync-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const projectParamsSchema = z.object({
  projectId: z.string().trim().min(1),
});

const syncBodySchema = z.object({
  noteId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
});

const specRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/projects/:projectId/spec/sync', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = syncBodySchema.parse(request.body ?? {});
    const result = await syncSpecTasks(fastify.sqlite, {
      noteId: body.noteId,
      projectId,
      sessionId: body.sessionId,
    });

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.specTaskSync);

    return {
      archivedCount: result.archivedTaskIds.length,
      archivedTaskIds: result.archivedTaskIds,
      createdCount: result.createdTaskIds.length,
      createdTaskIds: result.createdTaskIds,
      note: result.note,
      parsedTaskCount: result.parsedTaskCount,
      updatedCount: result.updatedTaskIds.length,
      updatedTaskIds: result.updatedTaskIds,
    };
  });
};

export default specRoute;
