import { State } from '@hateoas-ts/resource';
import { fireEvent, render, screen } from '@testing-library/react';
import { AcpSessionSummary } from '@shared/schema';
import { SessionList } from './session-list';
import { buildSessionTree } from './session-tree';

describe('SessionList', () => {
  it('collapses child sessions by default to reduce tree noise', () => {
    const { rootSession, childSession } = createSessionFixtures();

    render(
      <SessionList
        loading={false}
        onSelect={vi.fn()}
        sessions={buildSessionTree([childSession, rootSession])}
      />,
    );

    expect(screen.getByText('主控会话')).toBeTruthy();
    expect(screen.queryByText('实现搜索索引')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '展开子会话' }));

    expect(screen.getByText('实现搜索索引')).toBeTruthy();
    expect(screen.getByText('Child')).toBeTruthy();
    expect(screen.getByText('GATE')).toBeTruthy();
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

    expect(screen.getByText('实现搜索索引')).toBeTruthy();
    expect(screen.getByText('Child')).toBeTruthy();
    expect(screen.getByText('ROUTA')).toBeTruthy();
  });
});

function createSessionFixtures() {
  const rootSession = createSessionSummary({
    id: 'acps_root',
    name: '主控会话',
    specialistId: 'routa-coordinator',
  });
  const childSession = createSessionSummary({
    id: 'acps_child',
    name: '实现搜索索引',
    parentSession: { id: 'acps_root' },
    specialistId: 'gate-reviewer',
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
      completedAt: null,
      cwd: '/workspace',
      failureReason: null,
      id: 'acps_default',
      lastActivityAt: '2026-03-13T12:00:00.000Z',
      lastEventId: null,
      model: null,
      name: '默认会话',
      parentSession: null,
      project: { id: 'proj_123' },
      provider: 'opencode',
      specialistId: 'routa-coordinator',
      startedAt: '2026-03-13T11:55:00.000Z',
      ...overrides,
    },
  } as State<AcpSessionSummary>;
}
