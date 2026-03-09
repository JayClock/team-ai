import { describe, expect, it } from 'vitest';
import type {
  AgentGatewayClient,
  AgentGatewayEventEnvelope,
} from '../clients/agent-gateway-client';
import type {
  OrchestrationSessionPayload,
  OrchestrationStepPayload,
} from '../schemas/orchestration';
import { executeOrchestrationStepViaGateway } from './orchestration-step-executor';

describe('orchestration-step-executor', () => {
  it('returns a parsed artifact payload when gateway completes with JSON', async () => {
    const eventsBySession = new Map<string, AgentGatewayEventEnvelope[]>([
      [
        'runtime-1',
        [
          {
            type: 'status',
            cursor: 'cursor-1',
            data: { state: 'RUNNING' },
          },
          {
            type: 'delta',
            cursor: 'cursor-2',
            data: {
              text: '{"summary":"Plan local orchestration","tasks":[{"id":"task-1","title":"Hook gateway","description":"Use the local gateway runtime","acceptanceCriteria":["calls gateway"]}],"files":["apps/local-server/src/app/services/orchestration-step-executor.ts"],"verification":{"commands":["npx nx test local-server"],"notes":[]},"risks":[]}',
            },
          },
          {
            type: 'complete',
            cursor: 'cursor-3',
            data: { reason: 'done' },
          },
        ],
      ],
    ]);
    const client = createMockAgentGatewayClient(eventsBySession);

    const result = await executeOrchestrationStepViaGateway({
      agentGatewayClient: client,
      session: createSessionPayload(),
      step: createStepPayload(),
      upstreamArtifacts: [],
    });

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') {
      return;
    }
    expect(result.artifactKind).toBe('plan');
    expect(result.runtimeSessionId).toBe('runtime-1');
    expect(result.runtimeCursor).toBe('cursor-3');
    expect(result.parsedOutput).toMatchObject({
      summary: 'Plan local orchestration',
      files: ['apps/local-server/src/app/services/orchestration-step-executor.ts'],
    });
  });

  it('fails when gateway completes with invalid JSON', async () => {
    const eventsBySession = new Map<string, AgentGatewayEventEnvelope[]>([
      [
        'runtime-1',
        [
          {
            type: 'delta',
            cursor: 'cursor-1',
            data: {
              text: 'not-json',
            },
          },
          {
            type: 'complete',
            cursor: 'cursor-2',
            data: { reason: 'done' },
          },
        ],
      ],
    ]);
    const client = createMockAgentGatewayClient(eventsBySession);

    const result = await executeOrchestrationStepViaGateway({
      agentGatewayClient: client,
      session: createSessionPayload(),
      step: createStepPayload(),
      upstreamArtifacts: [],
    });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') {
      return;
    }
    expect(result.errorCode).toBe('ORCHESTRATION_OUTPUT_INVALID');
  });

  it('uses upstream artifacts for implement and verify steps', async () => {
    const eventsBySession = new Map<string, AgentGatewayEventEnvelope[]>([
      [
        'runtime-1',
        [
          {
            type: 'delta',
            cursor: 'cursor-1',
            data: {
              text: '{"summary":"Applied the plan","changedFiles":["apps/local-server/src/app/services/orchestration-service.ts"],"implementationNotes":["executor wired"],"followUps":[]}',
            },
          },
          {
            type: 'complete',
            cursor: 'cursor-2',
            data: { reason: 'done' },
          },
        ],
      ],
    ]);
    const client = createMockAgentGatewayClient(eventsBySession);

    const result = await executeOrchestrationStepViaGateway({
      agentGatewayClient: client,
      session: createSessionPayload(),
      step: {
        ...createStepPayload(),
        id: 'step-implement',
        kind: 'IMPLEMENT',
        role: 'crafter',
      },
      upstreamArtifacts: [
        {
          id: 'artifact-plan',
          sessionId: 'orc-test',
          stepId: 'step-plan',
          kind: 'plan',
          content: {
            summary: 'Plan local orchestration',
            tasks: [
              {
                id: 'task-1',
                title: 'Hook gateway',
                description: 'Use the local gateway runtime',
                acceptanceCriteria: ['calls gateway'],
              },
            ],
            files: ['apps/local-server/src/app/services/orchestration-service.ts'],
            verification: {
              commands: ['npx nx test local-server'],
              notes: [],
            },
            risks: [],
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    expect(result.status).toBe('completed');
  });
});

function createMockAgentGatewayClient(
  eventsBySession: Map<string, AgentGatewayEventEnvelope[]>,
): AgentGatewayClient {
  let nextSessionId = 0;
  const consumed = new Map<string, number>();

  return {
    async cancel(sessionId) {
      return {
        accepted: true,
        session: {
          sessionId,
          state: 'CANCELLED',
        },
      };
    },
    async createSession() {
      nextSessionId += 1;
      const sessionId = `runtime-${nextSessionId}`;
      return {
        session: {
          sessionId,
          state: 'PENDING',
        },
      };
    },
    async health() {
      return {
        configured: true,
        reachable: true,
      };
    },
    isConfigured() {
      return true;
    },
    async listEvents(sessionId, cursor) {
      const events = eventsBySession.get(sessionId) ?? [];
      const cursorIndex = cursor
        ? events.findIndex((event) => event.cursor === cursor)
        : -1;
      const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : consumed.get(sessionId) ?? 0;
      const nextEvents = events.slice(startIndex);
      consumed.set(sessionId, events.length);

      return {
        cursor: cursor ?? null,
        events: nextEvents,
        nextCursor: nextEvents.at(-1)?.cursor ?? cursor ?? null,
        session: {
          sessionId,
          state: events.some((event) => event.type === 'complete') ? 'COMPLETED' : 'RUNNING',
        },
      };
    },
    async prompt(sessionId) {
      return {
        accepted: true,
        session: {
          sessionId,
          state: 'RUNNING',
        },
      };
    },
    async stream() {
      return;
    },
  };
}

function createSessionPayload(): OrchestrationSessionPayload {
  return {
    id: 'orc-test',
    projectId: 'project-1',
    provider: 'codex',
    executionMode: 'ROUTA',
    title: 'Run local orchestration',
    goal: 'Implement local orchestration executor',
    status: 'RUNNING',
    strategy: {
      failFast: true,
      maxParallelism: 1,
      mode: 'planner-assisted',
    },
    stepCounts: {
      completed: 0,
      failed: 0,
      running: 1,
      total: 3,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workspaceRoot: '/tmp/team-ai',
    traceId: 'trace-test',
  };
}

function createStepPayload(): OrchestrationStepPayload {
  return {
    id: 'step-plan',
    sessionId: 'orc-test',
    title: 'Analyze request',
    kind: 'PLAN',
    status: 'RUNNING',
    attempt: 1,
    maxAttempts: 3,
    dependsOn: [],
    artifacts: [],
    role: 'planner',
    runtimeCursor: null,
    runtimeSessionId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
