import type {
  NoteEventEnvelopePayload,
  NoteEventListPayload,
} from '../schemas/note-event';

function presentNoteEventResource(event: NoteEventEnvelopePayload) {
  return {
    _links: {
      project: {
        href: `/api/projects/${event.projectId}`,
      },
      note: {
        href: `/api/notes/${event.noteId}`,
      },
      collection: {
        href: `/api/projects/${event.projectId}/note-events`,
      },
    },
    ...event,
  };
}

export function presentNoteEventList(payload: NoteEventListPayload) {
  const searchParams = new URLSearchParams({
    page: String(payload.page),
    pageSize: String(payload.pageSize),
  });

  if (payload.sessionId) {
    searchParams.set('sessionId', payload.sessionId);
  }

  if (payload.noteId) {
    searchParams.set('noteId', payload.noteId);
  }

  if (payload.type) {
    searchParams.set('type', payload.type);
  }

  return {
    _links: {
      self: {
        href: `/api/projects/${payload.projectId}/note-events?${searchParams.toString()}`,
      },
      project: {
        href: `/api/projects/${payload.projectId}`,
      },
      root: {
        href: '/api',
      },
    },
    _embedded: {
      noteEvents: payload.items.map(presentNoteEventResource),
    },
    noteId: payload.noteId,
    page: payload.page,
    pageSize: payload.pageSize,
    projectId: payload.projectId,
    sessionId: payload.sessionId,
    total: payload.total,
    type: payload.type,
  };
}
