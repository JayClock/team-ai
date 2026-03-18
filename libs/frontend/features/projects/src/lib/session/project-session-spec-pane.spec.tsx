import type { State } from '@hateoas-ts/resource';
import type { AcpSession, Note } from '@shared/schema';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectSessionSpecPane } from './project-session-spec-pane';
import type { TaskPanelItem } from './project-session-workbench.shared';

describe('ProjectSessionSpecPane', () => {
  it('renders spec content and spec-linked task lineage', () => {
    render(
      <ProjectSessionSpecPane
        note={createNoteState()}
        scopeSessionLabel="Root Session"
        selectedSession={createSessionState()}
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

    expect(screen.getByText('Spec 内容')).toBeTruthy();
    expect(screen.getByText('block #1')).toBeTruthy();
    expect(screen.getByText('执行会话 acps_exec_1')).toBeTruthy();
    expect(screen.getByText('结果会话 acps_result_1')).toBeTruthy();
    expect(
      screen.getAllByText(
        (_, element) =>
          (
            element as { textContent?: string | null } | null
          )?.textContent?.includes('@@@task') ?? false,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('shows empty state when no spec note exists', () => {
    render(
      <ProjectSessionSpecPane
        note={null}
        scopeSessionLabel={null}
        selectedSession={createSessionState()}
        tasksLoading={false}
        taskItems={[]}
      />,
    );

    expect(screen.getByText('未创建 Spec')).toBeTruthy();
    expect(screen.getByText('暂无关联任务')).toBeTruthy();
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
      cancelRequestedAt: null,
      cancelledAt: null,
      codebase: null,
      completedAt: null,
      cwd: '/workspace',
      deadlineAt: null,
      failureReason: null,
      forceKilledAt: null,
      id: 'acps_root',
      inactiveDeadlineAt: null,
      lastActivityAt: '2026-03-16T00:00:00.000Z',
      lastEventId: null,
      model: 'gpt-5',
      name: 'Root Session',
      parentSession: null,
      project: { id: 'project-1' },
      provider: 'opencode',
      specialistId: 'routa-coordinator',
      state: 'RUNNING',
      startedAt: '2026-03-16T00:00:00.000Z',
      stepCount: 0,
      supervisionPolicy: {
        cancelGraceMs: 1000,
        completionGraceMs: 1000,
        inactivityTimeoutMs: 600000,
        maxRetries: 0,
        maxSteps: 64,
        packageManagerInitTimeoutMs: 120000,
        promptTimeoutMs: 300000,
        providerInitTimeoutMs: 10000,
        totalTimeoutMs: 1800000,
      },
      timeoutScope: null,
      worktree: null,
    },
    follow: vi.fn(),
    hasLink: vi.fn(() => false),
  } as unknown as State<AcpSession>;
}

function createTaskPanelItem(overrides: Partial<TaskPanelItem>): TaskPanelItem {
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
