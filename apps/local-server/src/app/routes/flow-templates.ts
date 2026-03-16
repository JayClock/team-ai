import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { recordNoteEvent } from '../services/note-event-service';
import {
  createNote,
  findSpecNoteByScope,
  getNoteById,
  updateNote,
} from '../services/note-service';
import {
  getFlowTemplateById,
  listFlowTemplates,
  renderFlowTemplate,
} from '../services/flow-template-service';
import { getAcpSessionById } from '../services/acp-service';
import { getProjectById } from '../services/project-service';
import { syncSpecNoteToTasks } from '../services/spec-task-sync-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const templateParamsSchema = z.object({
  projectId: z.string().min(1),
  templateId: z.string().min(1),
});

const listFlowTemplatesQuerySchema = z.object({
  noteType: z.enum(['general', 'spec', 'task']).optional(),
});

const applyTemplateBodySchema = z.object({
  mergeStrategy: z.enum(['append', 'replace']).default('replace'),
  noteId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  variables: z.record(z.string(), z.string()).default({}),
});

const flowTemplatesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects/:projectId/flow-templates', async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const query = listFlowTemplatesQuerySchema.parse(request.query);

    return listFlowTemplates(fastify.sqlite, {
      noteType: query.noteType,
      projectId,
    });
  });

  fastify.get(
    '/projects/:projectId/flow-templates/:templateId',
    async (request) => {
      const { projectId, templateId } = templateParamsSchema.parse(
        request.params,
      );

      return getFlowTemplateById(fastify.sqlite, projectId, templateId);
    },
  );

  fastify.post(
    '/projects/:projectId/flow-templates/:templateId/apply',
    async (request, reply) => {
      const { projectId, templateId } = templateParamsSchema.parse(
        request.params,
      );
      const body = applyTemplateBodySchema.parse(request.body ?? {});
      const project = await getProjectById(fastify.sqlite, projectId);
      const template = await getFlowTemplateById(
        fastify.sqlite,
        projectId,
        templateId,
      );

      let sessionId: string | null = body.sessionId ?? null;
      if (sessionId) {
        const session = await getAcpSessionById(fastify.sqlite, sessionId);
        if (session.project.id !== projectId) {
          throw fastify.httpErrors.conflict(
            `Flow template project ${projectId} does not match session ${sessionId}`,
          );
        }
      }

      let note =
        body.noteId !== undefined
          ? await getNoteById(fastify.sqlite, body.noteId)
          : template.noteType === 'spec'
            ? await findSpecNoteByScope(fastify.sqlite, {
                projectId,
                sessionId,
              })
            : null;

      if (note && note.projectId !== projectId) {
        throw fastify.httpErrors.conflict(
          `Flow template project ${projectId} does not match note ${note.id}`,
        );
      }

      if (body.sessionId !== undefined && note && note.sessionId !== sessionId) {
        throw fastify.httpErrors.conflict(
          `Flow template session ${sessionId} does not match note ${note.id}`,
        );
      }

      const content = renderFlowTemplate(template, {
        currentDate: new Date().toISOString().slice(0, 10),
        projectId,
        projectTitle: project.title,
        sessionId,
        ...body.variables,
      });
      const nextContent =
        body.mergeStrategy === 'append' && note?.content.trim()
          ? `${note.content.trim()}\n\n---\n\n${content}`
          : content;
      const noteTitle =
        body.title ??
        note?.title ??
        (template.noteType === 'spec' ? `${template.name} Spec` : template.name);

      const savedNote = note
        ? await updateNote(fastify.sqlite, note.id, {
            content: nextContent,
            title: noteTitle,
            type: template.noteType,
          })
        : await createNote(fastify.sqlite, {
            content: nextContent,
            projectId,
            sessionId,
            source: 'system',
            title: noteTitle,
            type: template.noteType,
          });

      const noteEvent = await recordNoteEvent(fastify.sqlite, {
        note: savedNote,
        type: note ? 'updated' : 'created',
      });
      const taskSync =
        savedNote.type === 'spec'
          ? await syncSpecNoteToTasks(fastify.sqlite, savedNote)
          : null;

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.note);

      return {
        appliedTemplate: template,
        note: savedNote,
        noteEvent,
        taskSync,
      };
    },
  );
};

export default flowTemplatesRoute;
