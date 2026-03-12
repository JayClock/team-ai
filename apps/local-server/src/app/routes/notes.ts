import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentNote, presentNoteList } from '../presenters/note-presenter';
import { getAcpSessionById } from '../services/acp-service';
import {
  createNote,
  deleteNote,
  getNoteById,
  listNotes,
  updateNote,
} from '../services/note-service';

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
  fastify.get('/notes', async (request) => {
    const query = listNotesQuerySchema.parse(request.query);

    if (!query.projectId) {
      throw fastify.httpErrors.badRequest('projectId is required');
    }

    return presentNoteList(
      await listNotes(fastify.sqlite, {
        ...query,
        projectId: query.projectId,
      }),
    );
  });

  fastify.get('/projects/:projectId/notes', async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const query = listNotesQuerySchema.parse(request.query);

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

    reply.code(201).header('Location', `/api/notes/${note.id}`);
    return presentNote(note);
  });

  fastify.get(
    '/projects/:projectId/acp-sessions/:sessionId/notes',
    async (request) => {
      const { projectId, sessionId } = sessionParamsSchema.parse(
        request.params,
      );
      const query = listNotesQuerySchema.parse(request.query);

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

      reply.code(201).header('Location', `/api/notes/${note.id}`);
      return presentNote(note);
    },
  );

  fastify.get('/notes/:noteId', async (request) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    return presentNote(await getNoteById(fastify.sqlite, noteId));
  });

  fastify.patch('/notes/:noteId', async (request) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    const body = notePatchSchema.parse(request.body);
    return presentNote(await updateNote(fastify.sqlite, noteId, body));
  });

  fastify.delete('/notes/:noteId', async (request, reply) => {
    const { noteId } = noteParamsSchema.parse(request.params);
    await deleteNote(fastify.sqlite, noteId);
    reply.code(204).send();
  });
};

export default notesRoute;
