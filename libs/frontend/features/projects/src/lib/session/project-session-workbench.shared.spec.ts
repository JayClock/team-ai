import type { State } from '@hateoas-ts/resource';
import type { AcpSession } from '@shared/schema';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  buildTaskSnapshot,
  buildWorkbenchWalkthroughScenarios,
  buildTaskRunPanelItem,
  canRetryTask,
  deriveTaskWaveId,
  formatStatusLabel,
  formatVerificationVerdictLabel,
  getTaskPrimaryAction,
  renderEventDetails,
  type TaskPanelItem,
  type TaskRunPanelItem,
} from './project-session-workbench.shared';

describe('project session workbench task actions', () => {
  it('enables execute actions for ready implementation tasks', () => {
    const item = createTaskPanelItem({
      kind: 'implement',
      status: 'READY',
    });

    expect(getTaskPrimaryAction(item)).toMatchObject({
      action: 'execute',
      enabled: true,
      label: '开始执行',
    });
    expect(canRetryTask(item)).toBe(false);
  });

  it('enables review actions for pending review tasks', () => {
    const item = createTaskPanelItem({
      kind: 'review',
      status: 'PENDING',
    });

    expect(getTaskPrimaryAction(item)).toMatchObject({
      action: 'review',
      enabled: true,
      label: '开始复核',
    });
  });

  it('uses a verify-specific label for verification tasks', () => {
    const item = createTaskPanelItem({
      kind: 'verify',
      status: 'READY',
    });

    expect(getTaskPrimaryAction(item)).toMatchObject({
      action: 'review',
      enabled: true,
      label: '开始验证',
    });
  });

  it('disables the primary action and enables retry when a task is waiting to retry', () => {
    const item = createTaskPanelItem({
      kind: 'implement',
      status: 'WAITING_RETRY',
    });

    expect(getTaskPrimaryAction(item)).toMatchObject({
      action: 'execute',
      enabled: false,
      label: '开始执行',
    });
    expect(canRetryTask(item)).toBe(true);
    expect(formatStatusLabel('WAITING_RETRY')).toBe('等待重试');
  });

  it('disables all task actions when an execution session is already attached', () => {
    const item = createTaskPanelItem({
      executionSessionId: 'acps_running',
      kind: 'review',
      status: 'RUNNING',
    });

    expect(getTaskPrimaryAction(item)).toMatchObject({
      action: 'review',
      enabled: false,
    });
    expect(canRetryTask(item)).toBe(false);
  });

  it('formats supervision-aware lifecycle statuses', () => {
    expect(formatStatusLabel('CANCELLING')).toBe('正在取消');
    expect(formatStatusLabel('timed_out_inactive')).toBe('会话空闲超时');
    expect(formatStatusLabel('force_killed')).toBe('已强制终止');
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

  it('keeps the walkthrough checklist pending until the flow is exercised', () => {
    const scenarios = buildWorkbenchWalkthroughScenarios({
      events: [],
      runtimeProfile: createRuntimeProfile(),
      selectedSession: null,
      streamStatus: 'idle',
      taskItems: [],
    });

    expect(mapWalkthroughStatuses(scenarios)).toEqual({
      'developer-single-mode': 'ready',
      'failure-retry': 'pending',
      'goal-plan-review': 'ready',
      'provider-switch': 'ready',
    });
  });

  it('marks the multi-agent demo and retry scenarios covered when dispatch evidence is present', () => {
    const scenarios = buildWorkbenchWalkthroughScenarios({
      events: [
        {
          emittedAt: '2026-03-13T12:07:00.000Z',
          error: {
            code: 'PROVIDER_TIMEOUT',
            message: 'provider offline',
            retryAfterMs: 1000,
            retryable: true,
          },
          eventId: 'evt_error',
          sessionId: 'acps_root',
          update: {
            error: {
              code: 'PROVIDER_TIMEOUT',
              message: 'provider offline',
            },
            eventType: 'error',
            provider: 'opencode',
            rawNotification: null,
            sessionId: 'acps_root',
            timestamp: '2026-03-13T12:07:00.000Z',
          },
        },
      ],
      runtimeProfile: createRuntimeProfile(),
      selectedSession: createSessionState({
        failureReason: 'provider offline',
        id: 'acps_root',
      }),
      streamStatus: 'error',
      taskItems: [
        createTaskPanelItem({
          executionSessionId: 'acps_impl_exec',
          kind: 'implement',
          resultSessionId: 'acps_impl_result',
          status: 'WAITING_RETRY',
          taskRuns: [
            createTaskRunPanelItem({
              id: 'trun_impl_latest',
              retryOfRunId: 'trun_impl_prev',
              sessionId: 'acps_impl_exec',
              status: 'FAILED',
            }),
            createTaskRunPanelItem({
              id: 'trun_impl_prev',
              isLatest: false,
              sessionId: 'acps_impl_prev',
              status: 'FAILED',
            }),
          ],
        }),
        createTaskPanelItem({
          executionSessionId: 'acps_review_exec',
          kind: 'review',
          resultSessionId: 'acps_review_result',
          status: 'COMPLETED',
          taskRuns: [
            createTaskRunPanelItem({
              id: 'trun_review_latest',
              kind: 'review',
              sessionId: 'acps_review_exec',
              status: 'COMPLETED',
              summary: 'review finished',
              verificationReport: 'all checks passed',
              verificationVerdict: 'pass',
            }),
          ],
        }),
      ],
    });

    expect(mapWalkthroughStatuses(scenarios)).toEqual({
      'developer-single-mode': 'ready',
      'failure-retry': 'covered',
      'goal-plan-review': 'covered',
      'provider-switch': 'ready',
    });
  });

  it('marks developer mode and provider switch covered when a solo developer session uses a new provider', () => {
    const scenarios = buildWorkbenchWalkthroughScenarios({
      events: [],
      runtimeProfile: createRuntimeProfile({
        orchestrationMode: 'DEVELOPER',
        roleDefaults: {
          DEVELOPER: {
            model: null,
            providerId: 'anthropic',
          },
        },
      }),
      selectedSession: createSessionState({
        id: 'acps_solo',
        provider: 'opencode',
        specialistId: 'solo-developer',
      }),
      streamStatus: 'connected',
      taskItems: [],
    });

    expect(mapWalkthroughStatuses(scenarios)).toEqual({
      'developer-single-mode': 'covered',
      'failure-retry': 'ready',
      'goal-plan-review': 'ready',
      'provider-switch': 'covered',
    });
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

function createTaskRunPanelItem(
  overrides: Partial<TaskRunPanelItem>,
): TaskRunPanelItem {
  return {
    completedAt: '2026-03-13T12:05:00.000Z',
    createdAt: '2026-03-13T12:00:00.000Z',
    id: 'trun_123',
    isLatest: true,
    kind: 'implement',
    provider: 'opencode',
    retryOfRunId: null,
    role: 'DEVELOPER',
    sessionId: 'acps_123',
    specialistId: 'crafter-implementor',
    startedAt: '2026-03-13T12:01:00.000Z',
    status: 'COMPLETED',
    summary: null,
    updatedAt: '2026-03-13T12:05:00.000Z',
    verificationReport: null,
    verificationVerdict: null,
    ...overrides,
  };
}

function createSessionState(
  overrides: Partial<AcpSession['data']>,
): State<AcpSession> {
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
      name: '主控会话',
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
  } as State<AcpSession>;
}

function createRuntimeProfile(
  overrides: Partial<{
    orchestrationMode: 'ROUTA' | 'DEVELOPER';
    roleDefaults: {
      CRAFTER?: { model: string | null; providerId: string | null };
      DEVELOPER?: { model: string | null; providerId: string | null };
      GATE?: { model: string | null; providerId: string | null };
      ROUTA?: { model: string | null; providerId: string | null };
    };
  }> = {},
) {
  return {
    orchestrationMode: 'ROUTA' as const,
    roleDefaults: {
      ROUTA: {
        model: null,
        providerId: 'opencode',
      },
    },
    ...overrides,
  };
}

function mapWalkthroughStatuses(
  scenarios: ReturnType<typeof buildWorkbenchWalkthroughScenarios>,
) {
  return Object.fromEntries(
    scenarios.map((scenario: (typeof scenarios)[number]) => [
      scenario.id,
      scenario.status,
    ]),
  );
}
