import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentNote, presentNoteList } from '../presenters/note-presenter';
import { getAcpSessionById } from '../services/acp-service';
import { recordNoteEvent } from '../services/note-event-service';
import {
  createNote,
  deleteNote,
  getNoteById,
  listNotes,
  updateNote,
} from '../services/note-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const listNotesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  projectId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  type: z.enum(['spec', 'task', 'general']).optional(),
});

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const sessionParamsSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
});

const noteParamsSchema = z.object({
  noteId: z.string().min(1),
});

const nullableStringSchema = z.union([z.string().trim().min(1), z.null()]);
const stringArraySchema = z.array(z.string().trim().min(1));

const noteBodySchema = z.object({
  assignedAgentIds: stringArraySchema.optional(),
  content: z.string().optional(),
  format: z.enum(['markdown']).optional(),
  linkedTaskId: nullableStringSchema.optional(),
  parentNoteId: nullableStringSchema.optional(),
  sessionId: nullableStringSchema.optional(),
  source: z.enum(['user', 'agent', 'system']).optional(),
  title: z.string().trim().min(1),
  type: z.enum(['spec', 'task', 'general']).optional(),
});

const notePatchSchema = z
  .object({
    assignedAgentIds: stringArraySchema.optional(),
    content: z.string().optional(),
    format: z.enum(['markdown']).optional(),
    linkedTaskId: nullableStringSchema.optional(),
    parentNoteId: nullableStringSchema.optional(),
    sessionId: nullableStringSchema.optional(),
    source: z.enum(['user', 'agent', 'system']).optional(),
    title: z.string().trim().min(1).optional(),
    type: z.enum(['spec', 'task', 'general']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

const notesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/notes', async (request, reply) => {
    const query = listNotesQuerySchema.parse(request.query);

    if (!query.projectId) {
      throw fastify.httpErrors.badRequest('projectId is required');
    }

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.notes);

    return presentNoteList(
      await listNotes(fastify.sqlite, {
        ...query,
        projectId: query.projectId,
      }),
    );
  });

  fastify.get('/projects/:projectId/notes', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const query = listNotesQuerySchema.parse(request.query);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.notes);

    return presentNoteList(
      await listNotes(fastify.sqlite, {
        ...query,
        projectId,
      }),
    );
  });

  fastify.post('/projects/:projectId/notes', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = noteBodySchema.parse(request.body);
    const note = await createNote(fastify.sqlite, {
      ...body,
      projectId,
    });
    await recordNoteEvent(fastify.sqlite, {
      note,
      type: 'created',
    });

    reply
      .code(201)
      .header('Location', `/api/notes/${note.id}`)
      .type(VENDOR_MEDIA_TYPES.note);
    return presentNote(note);
  });

  fastify.get(
    '/projects/:projectId/acp-sessions/:sessionId/notes',
    async (request, reply) => {
      const { projectId, sessionId } = sessionParamsSchema.parse(
        request.params,
      );
      const query = listNotesQuerySchema.parse(request.query);

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.notes);

      return presentNoteList(
        await listNotes(fastify.sqlite, {
          ...query,
          projectId,
          sessionId,
        }),
      );
    },
  );

  fastify.post(
    '/projects/:projectId/acp-sessions/:sessionId/notes',
    async (request, reply) => {
      const { projectId, sessionId } = sessionParamsSchema.parse(
        request.params,
      );
      const session = await getAcpSessionById(fastify.sqlite, sessionId);

      if (session.project.id !== projectId) {
        throw fastify.httpErrors.notFound();
      }

      const body = noteBodySchema.parse(request.body);
      const note = await createNote(fastify.sqlite, {
        ...body,
        projectId,
        sessionId,
      });
      await recordNoteEvent(fastify.sqlite, {
        note,
        type: 'created',
      });

      reply
        .code(201)
        .header('Location', `/api/notes/${note.id}`)
        .type(VENDOR_MEDIA_TYPES.note);
      return presentNote(note);
    },
  );

  fastify.get('/notes/:noteId', async (request, reply) => {
    const { noteId } = noteParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.note);

    return presentNote(await getNoteById(fastify.sqlite, noteId));
  });

  fastify.patch('/notes/:noteId', async (request, reply) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    const body = notePatchSchema.parse(request.body);
    const note = await updateNote(fastify.sqlite, noteId, body);
    await recordNoteEvent(fastify.sqlite, {
      note,
      type: 'updated',
    });

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.note);

    return presentNote(note);
  });

  fastify.delete('/notes/:noteId', async (request, reply) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    const note = await deleteNote(fastify.sqlite, noteId);
    await recordNoteEvent(fastify.sqlite, {
      note,
      type: 'deleted',
    });
    reply.code(204).send();
  });
};

export default notesRoute;
