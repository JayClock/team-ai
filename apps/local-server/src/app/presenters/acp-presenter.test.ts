import { describe, expect, it } from 'vitest';
import { presentAcpSession } from './acp-presenter';

describe('acp presenter', () => {
  it('includes codebase and worktree links when available', () => {
    const session = presentAcpSession({
      id: 'acps_123',
      project: { id: 'proj_123' },
      agent: null,
      actor: { id: 'user_123' },
      codebase: { id: 'cdb_123' },
      parentSession: null,
      name: 'Implement feature',
      provider: 'codex',
      specialistId: null,
      task: { id: 'task_123' },
      cwd: '/tmp/worktrees/feature',
      startedAt: null,
      lastActivityAt: null,
      completedAt: null,
      failureReason: null,
      lastEventId: null,
      acpError: null,
      acpStatus: 'ready',
      worktree: { id: 'wt_123' },
    });

    expect(session).toMatchObject({
      _links: {
        codebase: {
          href: '/api/projects/proj_123/codebases/cdb_123',
        },
        worktree: {
          href: '/api/projects/proj_123/worktrees/wt_123',
        },
      },
    });
  });
});
