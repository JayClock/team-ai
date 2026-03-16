import {
  notesAppendArgsSchema,
  setNoteContentArgsSchema,
} from '../contracts';
import {
  createNotesAppendHandler,
  createSetNoteContentHandler,
} from '../tool-handlers';
import { defineToolRegistration } from './types';

export const noteToolCatalog = [
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
] as const;
