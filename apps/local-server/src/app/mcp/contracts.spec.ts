import { describe, expect, it } from 'vitest';
import { notesAppendArgsSchema, setNoteContentArgsSchema } from './contracts';

describe('note source schemas', () => {
  it('normalizes set_note_content source aliases to agent', () => {
    const parsed = setNoteContentArgsSchema.parse({
      content: 'Updated spec content',
      projectId: 'project-1',
      source: 'assistant',
      title: 'Execution Spec',
      type: 'spec',
    });

    expect(parsed.source).toBe('agent');
  });

  it('normalizes append_to_note source aliases to agent', () => {
    const parsed = notesAppendArgsSchema.parse({
      content: 'Follow-up update',
      projectId: 'project-1',
      source: 'orchestrator',
      title: 'Coordinator Log',
    });

    expect(parsed.source).toBe('agent');
  });

  it('keeps canonical note source values unchanged', () => {
    const parsed = setNoteContentArgsSchema.parse({
      content: 'System-authored content',
      projectId: 'project-1',
      source: 'system',
      title: 'System Note',
    });

    expect(parsed.source).toBe('system');
  });
});
