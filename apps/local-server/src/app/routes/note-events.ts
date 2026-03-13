import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentNoteEventList } from '../presenters/note-event-presenter';
import { listNoteEvents } from '../services/note-event-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const listNoteEventsQuerySchema = z.object({
  noteId: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sessionId: z.string().trim().min(1).optional(),
  type: z.enum(['created', 'updated', 'deleted']).optional(),
});

const noteEventsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects/:projectId/note-events', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const query = listNoteEventsQuerySchema.parse(request.query);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.noteEvents);

    return presentNoteEventList(
      await listNoteEvents(fastify.sqlite, {
        ...query,
        projectId,
      }),
    );
  });
};

export default noteEventsRoute;
