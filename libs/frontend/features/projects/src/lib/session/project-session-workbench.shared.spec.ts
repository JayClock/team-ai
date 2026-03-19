import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  buildTaskSnapshot,
  buildTaskRunPanelItem,
  deriveTaskWaveId,
  formatStatusLabel,
  formatVerificationVerdictLabel,
  renderEventDetails,
  type TaskPanelItem,
} from './project-session-workbench.shared';

describe('project session workbench helpers', () => {
  it('formats supervision-aware lifecycle statuses', () => {
    expect(formatStatusLabel('CANCELLING')).toBe('正在取消');
    expect(formatStatusLabel('timed_out_inactive')).toBe('会话空闲超时');
    expect(formatStatusLabel('force_killed')).toBe('已强制终止');
    expect(formatStatusLabel('WAITING_RETRY')).toBe('等待重试');
  });

  it('maps task run resources into timeline items', () => {
    const runItem = buildTaskRunPanelItem({
      data: {
        completedAt: '2026-03-13T12:05:00.000Z',
        createdAt: '2026-03-13T12:00:00.000Z',
        delegationGroupId: 'dg_wave_1',
        id: 'trun_latest',
        isLatest: true,
        kind: 'review',
        parentTaskId: 'task_parent',
        projectId: 'proj_123',
        provider: 'opencode',
        retryOfRunId: 'trun_prev',
        role: 'REVIEWER',
        sessionId: 'acps_123',
        specialistId: 'gate-reviewer',
        startedAt: '2026-03-13T12:01:00.000Z',
        status: 'FAILED',
        summary: '  review failed on regression  ',
        taskId: 'task_123',
        updatedAt: '2026-03-13T12:05:00.000Z',
        verificationReport: '  tests did not pass  ',
        verificationVerdict: 'fail',
        waveId: 'dg_wave_1:gate',
      },
    } as Parameters<typeof buildTaskRunPanelItem>[0]);

    expect(runItem).toMatchObject({
      id: 'trun_latest',
      delegationGroupId: 'dg_wave_1',
      isLatest: true,
      parentTaskId: 'task_parent',
      retryOfRunId: 'trun_prev',
      role: 'REVIEWER',
      sessionId: 'acps_123',
      specialistId: 'gate-reviewer',
      status: 'FAILED',
      summary: 'review failed on regression',
      verificationReport: 'tests did not pass',
      verificationVerdict: 'fail',
      waveId: 'dg_wave_1:gate',
    });
    expect(formatVerificationVerdictLabel(runItem.verificationVerdict)).toBe(
      '失败',
    );
  });

  it('renders supervision event details with timeout scope context', () => {
    const markup = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        renderEventDetails({
          emittedAt: '2026-03-13T12:07:00.000Z',
          error: null,
          eventId: 'evt_supervision',
          sessionId: 'acps_root',
          update: {
            eventType: 'supervision_update',
            provider: 'opencode',
            rawNotification: null,
            sessionId: 'acps_root',
            supervision: {
              detail: 'ACP session timed out (session_total) and exceeded cancel grace; force-killing runtime.',
              forceKilled: true,
              scope: 'session_total',
              stage: 'force_killed',
            },
            timestamp: '2026-03-13T12:07:00.000Z',
          },
        }),
      ),
    );

    expect(markup).toContain('会话总时长超时');
    expect(markup).toContain('force kill');
    expect(markup).toContain('force_killed');
  });

  it('derives wave ids from delegation groups and task kind', () => {
    expect(
      deriveTaskWaveId(
        createTaskPanelItem({
          kind: 'implement',
          parallelGroup: 'dg_wave_2',
        }),
      ),
    ).toBe('dg_wave_2:implement');
    expect(
      deriveTaskWaveId(
        createTaskPanelItem({
          kind: 'review',
          parallelGroup: 'dg_wave_2',
        }),
      ),
    ).toBe('dg_wave_2:gate');
  });

  it('uses canonical plan descriptions when building task snapshots', () => {
    const items = buildTaskSnapshot([
      {
        emittedAt: '2026-03-13T12:07:00.000Z',
        eventId: 'evt_plan',
        sessionId: 'acps_root',
        update: {
          eventType: 'plan_update',
          planItems: [
            {
              description: 'canonical plan title',
              priority: 'high',
              status: 'in_progress',
            },
          ],
          provider: 'opencode',
          rawNotification: null,
          sessionId: 'acps_root',
          timestamp: '2026-03-13T12:07:00.000Z',
        },
      },
    ] as Parameters<typeof buildTaskSnapshot>[0]);

    expect(items).toMatchObject([
      {
        title: 'canonical plan title',
        status: 'in_progress',
      },
    ]);
  });

  it('renders canonical tool output details before legacy raw output fallbacks', () => {
    const markup = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        renderEventDetails({
          emittedAt: '2026-03-13T12:07:00.000Z',
          eventId: 'evt_tool',
          sessionId: 'acps_root',
          update: {
            eventType: 'tool_call',
            provider: 'opencode',
            rawNotification: null,
            sessionId: 'acps_root',
            timestamp: '2026-03-13T12:07:00.000Z',
            toolCall: {
              content: [],
              inputFinalized: true,
              kind: 'read_file',
              locations: [],
              output: {
                result: 'done',
              },
              status: 'completed',
              toolCallId: 'tool-1',
            },
          },
        }),
      ),
    );

    expect(markup).toContain('&quot;result&quot;: &quot;done&quot;');
  });
});

function createTaskPanelItem(overrides: Partial<TaskPanelItem>): TaskPanelItem {
  return {
    id: 'task_123',
    source: 'task',
    status: 'PENDING',
    title: 'Task title',
    taskState: {} as TaskPanelItem['taskState'],
    ...overrides,
  };
}
