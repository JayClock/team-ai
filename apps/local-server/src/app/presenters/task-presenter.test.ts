import { describe, expect, it } from 'vitest';
import { presentTask } from './task-presenter';

describe('task presenter', () => {
  it('includes codebase and worktree links when available without old orchestration links', () => {
    const task = presentTask({
      id: 'task_123',
      projectId: 'proj_123',
      title: 'Implement worktree binding',
      objective: 'Bind tasks to worktrees',
      scope: null,
      status: 'READY',
      kind: 'implement',
      boardId: null,
      columnId: null,
      position: null,
      priority: null,
      labels: [],
      assignee: null,
      assignedProvider: 'codex',
      assignedRole: 'IMPLEMENTOR',
      assignedSpecialistId: null,
      assignedSpecialistName: null,
      codebaseId: 'cdb_123',
      dependencies: [],
      parallelGroup: null,
      acceptanceCriteria: [],
      verificationCommands: [],
      completionSummary: null,
      verificationVerdict: null,
      verificationReport: null,
      parentTaskId: null,
      executionSessionId: null,
      resultSessionId: null,
      sessionId: null,
      sourceEntryIndex: 2,
      sourceEventId: 'note_spec_123',
      sourceType: 'spec_note',
      triggerSessionId: null,
      githubId: null,
      githubNumber: null,
      githubUrl: null,
      githubRepo: null,
      githubState: null,
      githubSyncedAt: null,
      lastSyncError: null,
      laneHandoffs: [],
      laneSessions: [],
      createdAt: '2026-03-16T00:00:00.000Z',
      codebaseIds: ['cdb_123'],
      sessionIds: [],
      updatedAt: '2026-03-16T00:00:00.000Z',
      workspaceId: 'proj_123',
      worktreeId: 'wt_123',
    });

    expect(task).toMatchObject({
      sourceEntryIndex: 2,
      sourceEventId: 'note_spec_123',
      sourceType: 'spec_note',
      _links: {
        codebase: {
          href: '/api/projects/proj_123/codebases/cdb_123',
        },
        worktree: {
          href: '/api/projects/proj_123/worktrees/wt_123',
        },
      },
    });
    expect(task._links).not.toHaveProperty('execute');
    expect(task._links).not.toHaveProperty('runs');
    expect(task._links).not.toHaveProperty('orchestration-summary');
  });
});
