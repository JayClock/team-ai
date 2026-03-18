import { State } from '@hateoas-ts/resource';
import { fireEvent, render, screen } from '@testing-library/react';
import { AcpSessionSummary } from '@shared/schema';
import { describe, expect, it, vi } from 'vitest';
import { SessionList } from './session-list';
import { buildSessionTree } from './session-tree';

describe('SessionList', () => {
  it('collapses child sessions by default to reduce tree noise', () => {
    const { rootSession, childSession } = createSessionFixtures();

    render(
      <SessionList
        loading={false}
        onSelect={vi.fn()}
        sessionAnnotationsById={{
          acps_child: ['执行 task_search'],
        }}
        sessions={buildSessionTree([childSession, rootSession])}
      />,
    );

    expect(screen.getByText('主控会话')).toBeTruthy();
    expect(screen.queryByText('实现搜索索引')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '展开子会话' }));

    expect(screen.getByText('实现搜索索引')).toBeTruthy();
    expect(screen.getAllByText('Child').length).toBeGreaterThan(0);
    expect(screen.getByText('GATE')).toBeTruthy();
    expect(screen.getByText('gate-reviewer')).toBeTruthy();
    expect(screen.getByText('task task_search')).toBeTruthy();
    expect(screen.getByText('dg_search_wave')).toBeTruthy();
    expect(screen.getByText('dg_search_wave:gate')).toBeTruthy();
    expect(screen.getByText('执行 task_search')).toBeTruthy();
  });

  it('auto-expands the selected session lineage', () => {
    const { rootSession, childSession } = createSessionFixtures();

    render(
      <SessionList
        loading={false}
        onSelect={vi.fn()}
        selectedSessionId={childSession.data.id}
        sessions={buildSessionTree([childSession, rootSession])}
      />,
    );

    expect(screen.getAllByText('实现搜索索引').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Child').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ROUTA').length).toBeGreaterThan(0);
  });

  it('renders supervision-aware timeout labels for failed sessions', () => {
    const timedOutSession = createSessionSummary({
      failureReason: 'ACP session exceeded its inactivity budget.',
      forceKilledAt: '2026-03-13T12:05:00.000Z',
      id: 'acps_timeout',
      name: '空闲超时会话',
      state: 'FAILED',
      timeoutScope: 'session_inactive',
    });

    render(
      <SessionList
        loading={false}
        onSelect={vi.fn()}
        sessions={buildSessionTree([timedOutSession])}
      />,
    );

    expect(screen.getByText('已强制终止')).toBeTruthy();
    expect(
      screen.getByText(/会话空闲超时后未能在取消宽限期内结束/),
    ).toBeTruthy();
  });
});

function createSessionFixtures() {
  const rootSession = createSessionSummary({
    id: 'acps_root',
    name: '主控会话',
    specialistId: 'routa-coordinator',
  });
  const childSession = createSessionSummary({
    delegationGroupId: 'dg_search_wave',
    id: 'acps_child',
    name: '实现搜索索引',
    parentSession: { id: 'acps_root' },
    specialistId: 'gate-reviewer',
    task: { id: 'task_search' },
    waveId: 'dg_search_wave:gate',
  });

  return { childSession, rootSession };
}

function createSessionSummary(
  overrides: Partial<AcpSessionSummary['data']>,
): State<AcpSessionSummary> {
  return {
    data: {
      acpError: null,
      acpStatus: 'ready',
      actor: { id: 'user_123' },
      agent: null,
      cancelRequestedAt: null,
      cancelledAt: null,
      completedAt: null,
      cwd: '/workspace',
      deadlineAt: null,
      failureReason: null,
      forceKilledAt: null,
      id: 'acps_default',
      inactiveDeadlineAt: null,
      lastActivityAt: '2026-03-13T12:00:00.000Z',
      lastEventId: null,
      model: null,
      name: '默认会话',
      parentSession: null,
      project: { id: 'proj_123' },
      provider: 'opencode',
      specialistId: 'routa-coordinator',
      state: 'RUNNING',
      startedAt: '2026-03-13T11:55:00.000Z',
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
      ...overrides,
    },
  } as State<AcpSessionSummary>;
}
