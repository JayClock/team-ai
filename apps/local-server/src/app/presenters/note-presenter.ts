import type { NoteListPayload, NotePayload } from '../schemas/note';

function createCollectionHref(note: NotePayload) {
  if (note.sessionId) {
    return `/api/projects/${note.projectId}/acp-sessions/${note.sessionId}/notes`;
  }

  return `/api/projects/${note.projectId}/notes`;
}

function createNoteLinks(note: NotePayload) {
  return {
    self: {
      href: `/api/notes/${note.id}`,
    },
    collection: {
      href: createCollectionHref(note),
    },
    project: {
      href: `/api/projects/${note.projectId}`,
    },
    ...(note.sessionId
      ? {
          session: {
            href: `/api/projects/${note.projectId}/acp-sessions/${note.sessionId}`,
          },
        }
      : {}),
    ...(note.parentNoteId
      ? {
          parent: {
            href: `/api/notes/${note.parentNoteId}`,
          },
        }
      : {}),
    ...(note.linkedTaskId
      ? {
          task: {
            href: `/api/tasks/${note.linkedTaskId}`,
          },
        }
      : {}),
  };
}

function presentNoteResource(note: NotePayload) {
  return {
    _links: createNoteLinks(note),
    ...note,
  };
}

export function presentNote(note: NotePayload) {
  return presentNoteResource(note);
}

export function presentNoteList(payload: NoteListPayload) {
  const searchParams = new URLSearchParams({
    page: String(payload.page),
    pageSize: String(payload.pageSize),
  });

  if (payload.type) {
    searchParams.set('type', payload.type);
  }

  const selfHref = payload.sessionId
    ? `/api/projects/${payload.projectId}/acp-sessions/${payload.sessionId}/notes?${searchParams.toString()}`
    : `/api/projects/${payload.projectId}/notes?${searchParams.toString()}`;

  return {
    _links: {
      self: {
        href: selfHref,
      },
      project: {
        href: `/api/projects/${payload.projectId}`,
      },
      root: {
        href: '/api',
      },
    },
    _embedded: {
      notes: payload.items.map(presentNoteResource),
    },
    page: payload.page,
    pageSize: payload.pageSize,
    projectId: payload.projectId,
    sessionId: payload.sessionId,
    total: payload.total,
    type: payload.type,
  };
}
