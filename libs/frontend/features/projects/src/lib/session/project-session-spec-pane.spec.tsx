import type { State } from '@hateoas-ts/resource';
import type { AcpSession, Note } from '@shared/schema';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectSessionSpecPane } from './project-session-spec-pane';
import type { SpecSyncSnapshot, TaskPanelItem } from './project-session-workbench.shared';

describe('ProjectSessionSpecPane', () => {
  it('renders parse errors and spec-derived task lineage', () => {
    render(
      <ProjectSessionSpecPane
        note={createNoteState()}
        onSync={vi.fn()}
        scopeSessionLabel="Root Session"
        selectedSession={createSessionState()}
        syncLoading={false}
        syncSnapshot={createSyncSnapshot({
          parseError: 'Task block 2 is missing a closing "@@@" marker',
          status: 'parse_error',
        })}
        tasksLoading={false}
        taskItems={[
          createTaskPanelItem({
            executionSessionId: 'acps_exec_1',
            resultSessionId: 'acps_result_1',
            sourceEntryIndex: 0,
            sourceEventId: 'note_spec_1',
          }),
        ]}
      />,
    );

    expect(screen.getByText('解析错误')).toBeTruthy();
    expect(
      screen.getByText('Task block 2 is missing a closing "@@@" marker'),
    ).toBeTruthy();
    expect(screen.getByText('block #1')).toBeTruthy();
    expect(screen.getByText('执行会话 acps_exec_1')).toBeTruthy();
    expect(screen.getByText('结果会话 acps_result_1')).toBeTruthy();
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes('@@@task') ?? false,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('disables sync when no spec note exists', () => {
    render(
      <ProjectSessionSpecPane
        note={null}
        onSync={vi.fn()}
        scopeSessionLabel={null}
        selectedSession={createSessionState()}
        syncLoading={false}
        syncSnapshot={null}
        tasksLoading={false}
        taskItems={[]}
      />,
    );

    expect(screen.getByText('未找到 Spec')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '同步 Spec -> Tasks' }).getAttribute(
        'disabled',
      ),
    ).not.toBeNull();
  });
});

function createNoteState(): State<Note> {
  return {
    collection: [],
    data: {
      assignedAgentIds: [],
      content: '# Goal\n\n@@@task\n# Implement sync\n@@@\n',
      createdAt: '2026-03-16T00:00:00.000Z',
      format: 'markdown',
      id: 'note_spec_1',
      linkedTaskId: null,
      parentNoteId: null,
      projectId: 'project-1',
      sessionId: 'acps_root',
      source: 'user',
      title: 'Spec',
      type: 'spec',
      updatedAt: '2026-03-16T00:00:00.000Z',
    },
    follow: vi.fn(),
    hasLink: vi.fn(() => false),
  } as unknown as State<Note>;
}

function createSessionState(): State<AcpSession> {
  return {
    collection: [],
    data: {
      acpError: null,
      acpStatus: 'ready',
      actor: { id: 'user-1' },
      agent: null,
      codebase: null,
      completedAt: null,
      cwd: '/workspace',
      failureReason: null,
      id: 'acps_root',
      lastActivityAt: '2026-03-16T00:00:00.000Z',
      lastEventId: null,
      model: 'gpt-5',
      name: 'Root Session',
      parentSession: null,
      project: { id: 'project-1' },
      provider: 'opencode',
      specialistId: 'routa-coordinator',
      startedAt: '2026-03-16T00:00:00.000Z',
      worktree: null,
    },
    follow: vi.fn(),
    hasLink: vi.fn(() => false),
  } as unknown as State<AcpSession>;
}

function createSyncSnapshot(
  overrides: Partial<SpecSyncSnapshot>,
): SpecSyncSnapshot {
  return {
    conflictCount: 0,
    items: [],
    matchedCount: 1,
    noteId: 'note_spec_1',
    orphanedTaskCount: 0,
    parseError: null,
    parsedCount: 1,
    pendingCount: 0,
    status: 'clean',
    taskCount: 1,
    ...overrides,
  };
}

function createTaskPanelItem(
  overrides: Partial<TaskPanelItem>,
): TaskPanelItem {
  return {
    id: 'task_1',
    kind: 'implement',
    source: 'task',
    sourceEntryIndex: 0,
    sourceEventId: 'note_spec_1',
    sourceType: 'spec_note',
    status: 'READY',
    taskId: 'task_1',
    title: 'Implement sync',
    ...overrides,
  };
}
