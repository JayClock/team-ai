import { describe, expect, it } from 'vitest';
import {
  presentWorktree,
  presentWorktreeList,
} from './worktree-presenter';

describe('worktree presenter', () => {
  it('presents worktree resource links', () => {
    const worktree = presentWorktree({
      id: 'wt_123',
      projectId: 'proj_123',
      codebaseId: 'cdb_123',
      worktreePath: '/tmp/worktrees/feature-branch',
      branch: 'wt/feature-branch',
      baseBranch: 'main',
      status: 'active',
      sessionId: 'acps_123',
      label: 'feature-branch',
      errorMessage: null,
      createdAt: '2026-03-16T00:00:00.000Z',
      updatedAt: '2026-03-16T00:00:00.000Z',
    });

    expect(worktree).toMatchObject({
      _links: {
        self: {
          href: '/api/projects/proj_123/worktrees/wt_123',
        },
        collection: {
          href: '/api/projects/proj_123/codebases/cdb_123/worktrees',
        },
        codebase: {
          href: '/api/projects/proj_123/codebases/cdb_123',
        },
        session: {
          href: '/api/projects/proj_123/acp-sessions/acps_123',
        },
      },
    });
  });

  it('presents worktree collections', () => {
    const collection = presentWorktreeList({
      projectId: 'proj_123',
      codebaseId: 'cdb_123',
      items: [
        {
          id: 'wt_123',
          projectId: 'proj_123',
          codebaseId: 'cdb_123',
          worktreePath: '/tmp/worktrees/feature-branch',
          branch: 'wt/feature-branch',
          baseBranch: 'main',
          status: 'active',
          sessionId: null,
          label: 'feature-branch',
          errorMessage: null,
          createdAt: '2026-03-16T00:00:00.000Z',
          updatedAt: '2026-03-16T00:00:00.000Z',
        },
      ],
    });

    expect(collection).toMatchObject({
      _links: {
        self: {
          href: '/api/projects/proj_123/codebases/cdb_123/worktrees',
        },
      },
      _embedded: {
        worktrees: [
          expect.objectContaining({
            id: 'wt_123',
          }),
        ],
      },
    });
  });
});
