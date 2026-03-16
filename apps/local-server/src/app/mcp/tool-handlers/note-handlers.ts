import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProblemError } from '../../errors/problem-error';
import { applyFlowTemplate } from '../../services/apply-flow-template-service';
import { recordNoteEvent } from '../../services/note-event-service';
import {
  createNote,
  findSpecNoteByScope,
  listNotes,
  updateNote,
} from '../../services/note-service';
import {
  parseSpecTaskBlocks,
  syncSpecNoteToTasks,
} from '../../services/spec-task-sync-service';
import {
  applyFlowTemplateArgsSchema,
  listNotesArgsSchema,
  readNoteArgsSchema,
  notesAppendArgsSchema,
  setNoteContentArgsSchema,
} from '../contracts';
import {
  describeNoteScope,
  getProjectNote,
  getProjectSession,
  getProjectTask,
} from '../utils';
import { getProjectById } from '../../services/project-service';

type SetNoteContentArgs = z.infer<typeof setNoteContentArgsSchema>;
type ApplyFlowTemplateArgs = z.infer<typeof applyFlowTemplateArgsSchema>;
type NotesAppendArgs = z.infer<typeof notesAppendArgsSchema>;
type ListNotesArgs = z.infer<typeof listNotesArgsSchema>;
type ReadNoteArgs = z.infer<typeof readNoteArgsSchema>;

async function ensureNoteWriteScope(
  fastify: FastifyInstance,
  args: {
    parentNoteId?: string;
    projectId: string;
    sessionId?: string;
    taskId?: string;
  },
) {
  await getProjectById(fastify.sqlite, args.projectId);
  if (args.taskId) {
    await getProjectTask(fastify.sqlite, args.projectId, args.taskId);
  }
  if (args.sessionId) {
    await getProjectSession(fastify.sqlite, args.projectId, args.sessionId);
  }
  if (args.parentNoteId) {
    await getProjectNote(fastify.sqlite, args.projectId, args.parentNoteId);
  }
}

function buildNoteTitle(
  args: SetNoteContentArgs,
  existingTitle: string | null | undefined,
) {
  const nextTitle = args.title ?? existingTitle ?? (args.type === 'spec' ? 'Spec' : null);
  if (nextTitle) {
    return nextTitle;
  }

  throw new ProblemError({
    type: 'https://team-ai.dev/problems/mcp-note-title-required',
    title: 'MCP Note Title Required',
    status: 400,
    detail: 'set_note_content requires title when creating a new note',
  });
}

export function createSetNoteContentHandler(fastify: FastifyInstance) {
  return async (args: SetNoteContentArgs) => {
    await ensureNoteWriteScope(fastify, args);

    if (args.type === 'spec') {
      parseSpecTaskBlocks(args.content);
    }

    let note = args.noteId
      ? await getProjectNote(fastify.sqlite, args.projectId, args.noteId)
      : null;
    if (!note && args.type === 'spec') {
      note = await findSpecNoteByScope(fastify.sqlite, {
        projectId: args.projectId,
        sessionId: args.sessionId,
      });
    }

    const nextTitle = buildNoteTitle(args, note?.title);
    const savedNote = note
      ? await updateNote(fastify.sqlite, note.id, {
          assignedAgentIds: args.assignedAgentIds,
          content: args.content,
          linkedTaskId: args.taskId,
          parentNoteId: args.parentNoteId,
          sessionId: args.sessionId,
          source: args.source,
          title: nextTitle,
          type: args.type,
        })
      : await createNote(fastify.sqlite, {
          assignedAgentIds: args.assignedAgentIds,
          content: args.content,
          linkedTaskId: args.taskId,
          parentNoteId: args.parentNoteId,
          projectId: args.projectId,
          sessionId: args.sessionId,
          source: args.source,
          title: nextTitle,
          type: args.type,
        });

    await recordNoteEvent(fastify.sqlite, {
      note: savedNote,
      type: note ? 'updated' : 'created',
    });

    const taskSync =
      savedNote.type === 'spec'
        ? await syncSpecNoteToTasks(fastify.sqlite, savedNote)
        : null;

    return {
      note: savedNote,
      scope: describeNoteScope(savedNote),
      taskSync,
    };
  };
}

export function createApplyFlowTemplateHandler(fastify: FastifyInstance) {
  return async (args: ApplyFlowTemplateArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);

    if (args.sessionId) {
      await getProjectSession(fastify.sqlite, args.projectId, args.sessionId);
    }

    if (args.noteId) {
      await getProjectNote(fastify.sqlite, args.projectId, args.noteId);
    }

    return await applyFlowTemplate(fastify.sqlite, args);
  };
}

export function createListNotesHandler(fastify: FastifyInstance) {
  return async (args: ListNotesArgs) => {
    await ensureNoteWriteScope(fastify, {
      projectId: args.projectId,
      sessionId: args.sessionId,
    });

    return await listNotes(fastify.sqlite, args);
  };
}

export function createReadNoteHandler(fastify: FastifyInstance) {
  return async (args: ReadNoteArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);

    return {
      note: await getProjectNote(fastify.sqlite, args.projectId, args.noteId),
    };
  };
}

export function createNotesAppendHandler(fastify: FastifyInstance) {
  return async (args: NotesAppendArgs) => {
    await ensureNoteWriteScope(fastify, args);

    const note = await createNote(fastify.sqlite, {
      assignedAgentIds: args.assignedAgentIds,
      content: args.content,
      linkedTaskId: args.taskId,
      parentNoteId: args.parentNoteId,
      projectId: args.projectId,
      sessionId: args.sessionId,
      source: args.source,
      title: args.title,
      type: args.type,
    });
    await recordNoteEvent(fastify.sqlite, {
      note,
      type: 'created',
    });

    return {
      note,
      scope: describeNoteScope(note),
    };
  };
}
