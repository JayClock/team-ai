import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { resolveDesktopCorsHeaders } from '../plugins/desktop-cors';
import { presentNoteEventList } from '../presenters/note-event-presenter';
import {
  getNoteEventStreamBroker,
  listNoteEvents,
  listNoteEventsSince,
} from '../services/note-event-service';
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

const streamNoteEventsQuerySchema = z.object({
  noteId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  sinceEventId: z.string().trim().min(1).optional(),
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

  fastify.get('/projects/:projectId/note-events/stream', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const query = streamNoteEventsQuerySchema.parse(request.query);
    const history = await listNoteEventsSince(fastify.sqlite, {
      noteId: query.noteId,
      projectId,
      sessionId: query.sessionId,
      sinceEventId: query.sinceEventId,
      type: query.type,
    });

    reply.raw.writeHead(200, {
      ...resolveDesktopCorsHeaders(request.headers.origin),
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
    });

    reply.raw.write(
      `event: connected\ndata: ${JSON.stringify({
        at: new Date().toISOString(),
        noteId: query.noteId ?? null,
        projectId,
        sessionId: query.sessionId ?? null,
      })}\n\n`,
    );

    for (const event of history) {
      reply.raw.write(`event: note-event\ndata: ${JSON.stringify(event)}\n\n`);
    }

    const unsubscribe = getNoteEventStreamBroker().subscribe(
      {
        noteId: query.noteId,
        projectId,
        sessionId: query.sessionId,
        type: query.type,
      },
      (event) => {
        reply.raw.write(`event: note-event\ndata: ${JSON.stringify(event)}\n\n`);
      },
    );

    const heartbeat = setInterval(() => {
      reply.raw.write(
        `event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
      );
    }, 15_000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      reply.raw.end();
    });

    return reply.hijack();
  });
};

export default noteEventsRoute;
