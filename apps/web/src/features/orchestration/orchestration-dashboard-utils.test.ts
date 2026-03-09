import {
  collectArtifactsByStep,
  collectRuntimeOutputByStep,
  statusTone,
  summarizeEvent,
  type OrchestrationEventView,
  type OrchestrationStepView,
} from './orchestration-dashboard-utils';

describe('orchestration-dashboard-utils', () => {
  it('collects streamed runtime output by step', () => {
    const outputs = collectRuntimeOutputByStep([
      createEvent('step.runtime.event', 'step-1', {
        gatewayEvent: {
          data: {
            text: 'hello ',
          },
        },
      }),
      createEvent('step.runtime.event', 'step-1', {
        gatewayEvent: {
          data: {
            text: 'world',
          },
        },
      }),
      createEvent('step.completed', 'step-1', {
        kind: 'PLAN',
      }),
    ]);

    expect(outputs).toEqual({
      'step-1': ['hello ', 'world'],
    });
  });

  it('summarizes gateway runtime events using streamed text', () => {
    expect(
      summarizeEvent(
        createEvent('step.runtime.event', 'step-1', {
          gatewayEvent: {
            data: {
              text: 'streamed log',
            },
          },
        }),
      ),
    ).toBe('streamed log');
  });

  it('collects persisted artifacts across steps', () => {
    const artifacts = collectArtifactsByStep([
      createStep('step-plan', 'PLAN', [
        {
          id: 'artifact-plan',
          sessionId: 'orc-1',
          stepId: 'step-plan',
          kind: 'plan',
          content: { summary: 'Plan local orchestration' },
          createdAt: '2026-03-09T00:00:00.000Z',
          updatedAt: '2026-03-09T00:00:00.000Z',
        },
      ]),
      createStep('step-verify', 'VERIFY', []),
    ]);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      stepId: 'step-plan',
      stepKind: 'PLAN',
      stepTitle: 'PLAN step-plan',
      artifact: {
        kind: 'plan',
      },
    });
  });

  it('returns amber tone for waiting-retry steps', () => {
    expect(statusTone('WAITING_RETRY')).toContain('amber');
  });
});

function createEvent(
  type: string,
  stepId: string,
  payload: Record<string, unknown>,
): OrchestrationEventView {
  return {
    at: '2026-03-09T00:00:00.000Z',
    id: `${stepId}:${type}`,
    payload,
    sessionId: 'orc-1',
    stepId,
    type,
  };
}

function createStep(
  id: string,
  kind: OrchestrationStepView['kind'],
  artifacts: OrchestrationStepView['artifacts'],
): OrchestrationStepView {
  return {
    id,
    sessionId: 'orc-1',
    title: `${kind} ${id}`,
    kind,
    status: 'COMPLETED',
    attempt: 1,
    maxAttempts: 3,
    dependsOn: [],
    artifacts,
    createdAt: '2026-03-09T00:00:00.000Z',
    updatedAt: '2026-03-09T00:00:00.000Z',
  };
}
