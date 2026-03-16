import type { Database } from 'better-sqlite3';
import { ProblemError } from '../errors/problem-error';
import { recordNoteEvent } from './note-event-service';
import {
  createNote,
  findSpecNoteByScope,
  getNoteById,
  updateNote,
} from './note-service';
import {
  getFlowTemplateById,
  renderFlowTemplate,
} from './flow-template-service';
import { getAcpSessionById } from './acp-service';
import { getProjectById } from './project-service';
import { syncSpecNoteToTasks } from './spec-task-sync-service';

export interface ApplyFlowTemplateInput {
  mergeStrategy?: 'append' | 'replace';
  noteId?: string;
  projectId: string;
  sessionId?: string;
  templateId: string;
  title?: string;
  variables?: Record<string, string>;
}

export async function applyFlowTemplate(
  sqlite: Database,
  input: ApplyFlowTemplateInput,
) {
  const mergeStrategy = input.mergeStrategy ?? 'replace';
  const project = await getProjectById(sqlite, input.projectId);
  const template = await getFlowTemplateById(
    sqlite,
    input.projectId,
    input.templateId,
  );
  const sessionId = input.sessionId ?? null;

  if (sessionId) {
    const session = await getAcpSessionById(sqlite, sessionId);
    if (session.project.id !== input.projectId) {
      throw new ProblemError({
        type: 'https://team-ai.dev/problems/flow-template-session-project-mismatch',
        title: 'Flow Template Session Project Mismatch',
        status: 409,
        detail:
          `Flow template project ${input.projectId} does not match session ${sessionId}`,
      });
    }
  }

  const note =
    input.noteId !== undefined
      ? await getNoteById(sqlite, input.noteId)
      : template.noteType === 'spec'
        ? await findSpecNoteByScope(sqlite, {
            projectId: input.projectId,
            sessionId,
          })
        : null;

  if (note && note.projectId !== input.projectId) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/flow-template-note-project-mismatch',
      title: 'Flow Template Note Project Mismatch',
      status: 409,
      detail: `Flow template project ${input.projectId} does not match note ${note.id}`,
    });
  }

  if (input.sessionId !== undefined && note && note.sessionId !== sessionId) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/flow-template-session-note-mismatch',
      title: 'Flow Template Session Note Mismatch',
      status: 409,
      detail: `Flow template session ${sessionId} does not match note ${note.id}`,
    });
  }

  const content = renderFlowTemplate(template, {
    currentDate: new Date().toISOString().slice(0, 10),
    projectId: input.projectId,
    projectTitle: project.title,
    sessionId,
    ...(input.variables ?? {}),
  });
  const nextContent =
    mergeStrategy === 'append' && note?.content.trim()
      ? `${note.content.trim()}\n\n---\n\n${content}`
      : content;
  const noteTitle =
    input.title ??
    note?.title ??
    (template.noteType === 'spec' ? `${template.name} Spec` : template.name);

  const savedNote = note
    ? await updateNote(sqlite, note.id, {
        content: nextContent,
        title: noteTitle,
        type: template.noteType,
      })
    : await createNote(sqlite, {
        content: nextContent,
        projectId: input.projectId,
        sessionId,
        source: 'system',
        title: noteTitle,
        type: template.noteType,
      });

  const noteEvent = await recordNoteEvent(sqlite, {
    note: savedNote,
    type: note ? 'updated' : 'created',
  });
  const taskSync =
    savedNote.type === 'spec'
      ? await syncSpecNoteToTasks(sqlite, savedNote)
      : null;

  return {
    appliedTemplate: template,
    note: savedNote,
    noteEvent,
    taskSync,
  };
}
