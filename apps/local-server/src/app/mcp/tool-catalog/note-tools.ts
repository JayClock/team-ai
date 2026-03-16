import {
  listNotesArgsSchema,
  readNoteArgsSchema,
  notesAppendArgsSchema,
  setNoteContentArgsSchema,
} from '../contracts';
import {
  createListNotesHandler,
  createReadNoteHandler,
  createNotesAppendHandler,
  createSetNoteContentHandler,
} from '../tool-handlers';
import { defineToolRegistration } from './types';

export const noteToolCatalog = [
  defineToolRegistration(
    'list_notes',
    listNotesArgsSchema,
    {
      access: 'read',
      annotations: {
        idempotentHint: true,
        readOnlyHint: true,
      },
      description:
        'List project notes with optional session and type filters in the local desktop runtime.',
      title: 'List Notes',
    },
    createListNotesHandler,
  ),
  defineToolRegistration(
    'read_note',
    readNoteArgsSchema,
    {
      access: 'read',
      annotations: {
        idempotentHint: true,
        readOnlyHint: true,
      },
      description:
        'Read a single project note including full markdown content and note linkage metadata.',
      title: 'Read Note',
    },
    createReadNoteHandler,
  ),
  defineToolRegistration(
    'set_note_content',
    setNoteContentArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description:
        'Create or replace a note. For spec notes, this also synchronizes structured @@@task blocks into project tasks.',
      title: 'Set Note Content',
    },
    createSetNoteContentHandler,
  ),
  defineToolRegistration(
    'notes_append',
    notesAppendArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description:
        'Append a new note to a project. sessionId scopes the note to a session, taskId links it to a task, and providing both keeps session ownership while linking the task.',
      title: 'Append Note',
    },
    createNotesAppendHandler,
  ),
  defineToolRegistration(
    'append_to_note',
    notesAppendArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description:
        'Append a new note to a project. Alias of notes_append for specialist prompt compatibility.',
      title: 'Append To Note',
    },
    createNotesAppendHandler,
  ),
] as const;
