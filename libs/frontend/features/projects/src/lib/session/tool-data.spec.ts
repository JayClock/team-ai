import { describe, expect, it } from 'vitest';
import {
  inferToolDisplayName,
  normalizeToolValue,
  resolveToolEventName,
} from './tool-data';

describe('tool data helpers', () => {
  it('extracts provider tool names from provider-formatted titles', () => {
    expect(
      inferToolDisplayName('Tool: routa-coordination/update_card', undefined, {
        boardId: 'board-1',
      }),
    ).toBe('update_card');
  });

  it('infers tool display names from generic names and structured input', () => {
    expect(
      inferToolDisplayName('tool', undefined, {
        information_request: 'Find ACP manager implementation',
      }),
    ).toBe('codebase-retrieval');
  });

  it('normalizes json strings and text content arrays', () => {
    expect(normalizeToolValue('{"ok":true,"count":2}')).toEqual({
      ok: true,
      count: 2,
    });
    expect(
      normalizeToolValue([
        { type: 'text', text: '{"message":"done"}' },
      ]),
    ).toEqual({
      message: 'done',
    });
  });

  it('falls back to command labels when explicit names are missing', () => {
    expect(
      resolveToolEventName(
        {
          command: [
            '/bin/zsh',
            '-lc',
            "sed -n '1,20p' src/app.ts",
          ],
        },
        {
          kind: null,
          title: null,
        },
      ),
    ).toContain('sed -n');
  });
});
