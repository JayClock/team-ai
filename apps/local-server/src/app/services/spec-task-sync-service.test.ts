import { describe, expect, it } from 'vitest';
import { ProblemError } from '../errors/problem-error';
import { parseSpecTaskBlocks } from './spec-task-sync-service';

describe('spec task sync service', () => {
  it('parses routa-style task blocks into task payload fields', () => {
    const blocks = parseSpecTaskBlocks(`
## Goal
Ship the first routa-aligned loop.

@@@task
# Implement spec sync
Create the first spec-to-task sync path.

## Scope
apps/local-server note and task sync modules

## Definition of Done
- Spec notes can be parsed
- Tasks are created idempotently

## Verification
- npx vitest run spec-task-sync-service.test.ts
- npx vitest run mcp.test.ts
@@@
`);

    expect(blocks).toEqual([
      expect.objectContaining({
        acceptanceCriteria: [
          'Spec notes can be parsed',
          'Tasks are created idempotently',
        ],
        index: 0,
        kind: 'implement',
        objective: 'Create the first spec-to-task sync path.',
        scope: 'apps/local-server note and task sync modules',
        title: 'Implement spec sync',
        verificationCommands: [
          'npx vitest run spec-task-sync-service.test.ts',
          'npx vitest run mcp.test.ts',
        ],
      }),
    ]);
  });

  it('rejects unterminated task blocks', () => {
    expect(() =>
      parseSpecTaskBlocks(`
@@@task
# Broken block
Missing closing marker
`),
    ).toThrowError(ProblemError);

    try {
      parseSpecTaskBlocks(`
@@@task
# Broken block
Missing closing marker
`);
    } catch (error) {
      expect(error).toBeInstanceOf(ProblemError);
      expect((error as ProblemError).type).toBe(
        'https://team-ai.dev/problems/spec-task-block-invalid',
      );
    }
  });
});
