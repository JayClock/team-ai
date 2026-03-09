import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  AgentGatewayClient,
  AgentGatewayEventEnvelope,
} from '../clients/agent-gateway-client';
import { initializeDatabase } from '../db/sqlite';
import { OrchestrationStreamBroker } from '../plugins/orchestration-stream';
import { createProject } from './project-service';
import {
  createOrchestrationSession,
  getOrchestrationSessionById,
  listOrchestrationEvents,
  listOrchestrationSteps,
} from './orchestration-service';

describe('orchestration storage metadata', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('applies runtime metadata migration and exposes new session fields', async () => {
    const sqlite = await createTestDatabase();
    const broker = new OrchestrationStreamBroker();

    const project = await createProject(sqlite, {
      title: 'Storage Migration Project',
      description: 'Test orchestration storage metadata',
    });

    const { session } = await createOrchestrationSession(sqlite, broker, {
      projectId: project.id,
      title: 'Implement local workflow',
      goal: 'Wire local orchestration runtime',
      provider: 'codex',
      executionMode: 'local',
      workspaceRoot: '/tmp/team-ai-workspace',
      traceId: 'trace-storage-1',
    });

    const reloadedSession = await getOrchestrationSessionById(sqlite, session.id);
    const steps = await listOrchestrationSteps(sqlite, session.id);

    expect(reloadedSession.provider).toBe('codex');
    expect(reloadedSession.executionMode).toBe('local');
    expect(reloadedSession.workspaceRoot).toBe('/tmp/team-ai-workspace');
    expect(reloadedSession.traceId).toBe('trace-storage-1');

    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.role)).toEqual([
      'planner',
      'crafter',
      'gate',
    ]);
    expect(steps.every((step) => step.artifacts.length === 0)).toBe(true);
    expect(steps.every((step) => step.runtimeSessionId === null)).toBe(true);
    expect(steps.every((step) => step.errorCode === null)).toBe(true);
  });

  it('creates the orchestration_artifacts table and runtime metadata columns', async () => {
    const sqlite = await createTestDatabase();

    const artifactTable = sqlite
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table' AND name = 'orchestration_artifacts'
        `,
      )
      .get() as { name: string } | undefined;

    const sessionColumns = (
      sqlite.prepare(`PRAGMA table_info(orchestration_sessions)`).all() as Array<{
        name: string;
      }>
    ).map((column) => column.name);

    const stepColumns = (
      sqlite.prepare(`PRAGMA table_info(orchestration_steps)`).all() as Array<{
        name: string;
      }>
    ).map((column) => column.name);

    expect(artifactTable?.name).toBe('orchestration_artifacts');
    expect(sessionColumns).toEqual(
      expect.arrayContaining([
        'provider',
        'workspace_root',
        'execution_mode',
        'trace_id',
      ]),
    );
    expect(stepColumns).toEqual(
      expect.arrayContaining([
        'role',
        'input_json',
        'output_json',
        'runtime_session_id',
        'runtime_cursor',
        'started_at',
        'completed_at',
        'error_code',
        'error_message',
      ]),
    );
  });

  it('executes PLAN / IMPLEMENT / VERIFY through the gateway client', async () => {
    const sqlite = await createTestDatabase();
    const broker = new OrchestrationStreamBroker();
    const project = await createProject(sqlite, {
      title: 'Gateway Execution Project',
      description: 'Run gateway-backed orchestration',
    });

    const gatewayClient = createScriptedGatewayClient({
      onPlan: {
        summary: 'Plan local orchestration',
        tasks: [
          {
            id: 'task-1',
            title: 'Hook local gateway',
            description: 'Replace the synthetic executor',
            acceptanceCriteria: ['uses gateway client', 'stores runtime session id'],
          },
        ],
        files: ['apps/local-server/src/app/services/orchestration-service.ts'],
        verification: {
          commands: ['npx nx test local-server'],
          notes: [],
        },
        risks: [],
      },
      onImplement: {
        summary: 'Implemented gateway-backed execution',
        changedFiles: ['apps/local-server/src/app/services/orchestration-service.ts'],
        implementationNotes: ['connected the step executor to agent-gateway'],
        followUps: [],
      },
      onVerify: {
        verdict: 'pass',
        summary: 'Implementation satisfies the plan',
        findings: [],
        recommendedNextStep: 'complete',
      },
    });

    const { session } = await createOrchestrationSession(
      sqlite,
      broker,
      {
        projectId: project.id,
        title: 'Implement local workflow',
        goal: 'Wire local orchestration runtime',
        provider: 'codex',
        executionMode: 'local',
        workspaceRoot: '/tmp/team-ai-workspace',
        traceId: 'trace-execution-1',
      },
      gatewayClient,
    );

    await waitForTerminalSession(sqlite, session.id, 'COMPLETED');

    const finalSession = await getOrchestrationSessionById(sqlite, session.id);
    const steps = await listOrchestrationSteps(sqlite, session.id);
    const events = await listOrchestrationEvents(sqlite, session.id);

    expect(finalSession.status).toBe('COMPLETED');
    expect(steps.map((step) => step.status)).toEqual([
      'COMPLETED',
      'COMPLETED',
      'COMPLETED',
    ]);
    expect(steps.every((step) => step.runtimeSessionId)).toBe(true);
    expect(steps.map((step) => step.artifacts[0]?.kind)).toEqual([
      'plan',
      'implementation',
      'verification',
    ]);
    expect(
      events.some((event) => event.type === 'step.runtime.event'),
    ).toBe(true);
  });

  it('marks the session failed when verification returns a fail verdict', async () => {
    const sqlite = await createTestDatabase();
    const broker = new OrchestrationStreamBroker();
    const project = await createProject(sqlite, {
      title: 'Gateway Failure Project',
      description: 'Run verification failure path',
    });

    const gatewayClient = createScriptedGatewayClient({
      onPlan: {
        summary: 'Plan local orchestration',
        tasks: [
          {
            id: 'task-1',
            title: 'Hook local gateway',
            description: 'Replace the synthetic executor',
            acceptanceCriteria: ['uses gateway client'],
          },
        ],
        files: ['apps/local-server/src/app/services/orchestration-service.ts'],
        verification: {
          commands: ['npx nx test local-server'],
          notes: [],
        },
        risks: [],
      },
      onImplement: {
        summary: 'Implemented gateway-backed execution',
        changedFiles: ['apps/local-server/src/app/services/orchestration-service.ts'],
        implementationNotes: ['connected the step executor to agent-gateway'],
        followUps: [],
      },
      onVerify: {
        verdict: 'fail',
        summary: 'Verification found a regression',
        findings: [
          {
            severity: 'high',
            title: 'Regression',
            detail: 'The verification contract failed',
          },
        ],
        recommendedNextStep: 'retry-step',
      },
    });

    const { session } = await createOrchestrationSession(
      sqlite,
      broker,
      {
        projectId: project.id,
        title: 'Implement local workflow',
        goal: 'Wire local orchestration runtime',
      },
      gatewayClient,
    );

    await waitForTerminalSession(sqlite, session.id, 'FAILED');

    const finalSession = await getOrchestrationSessionById(sqlite, session.id);
    const steps = await listOrchestrationSteps(sqlite, session.id);
    const verifyStep = steps[2];

    expect(finalSession.status).toBe('FAILED');
    expect(verifyStep?.status).toBe('FAILED');
    expect(verifyStep?.errorCode).toBe('VERIFICATION_FAILED');
    expect(verifyStep?.artifacts[0]?.kind).toBe('verification');
    expect(verifyStep?.output).toMatchObject({
      verdict: 'fail',
      summary: 'Verification found a regression',
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-local-server-'));
    const previousDataDir = process.env.TEAMAI_DATA_DIR;

    process.env.TEAMAI_DATA_DIR = dataDir;
    const sqlite = initializeDatabase();

    cleanupTasks.push(async () => {
      sqlite.close();
      if (previousDataDir === undefined) {
        delete process.env.TEAMAI_DATA_DIR;
      } else {
        process.env.TEAMAI_DATA_DIR = previousDataDir;
      }
      await rm(dataDir, { recursive: true, force: true });
    });

    return sqlite;
  }

  async function waitForTerminalSession(
    sqlite: Database,
    sessionId: string,
    expectedStatus: 'COMPLETED' | 'FAILED',
  ) {
    const deadline = Date.now() + 5_000;

    while (Date.now() < deadline) {
      const session = await getOrchestrationSessionById(sqlite, sessionId);
      if (session.status === expectedStatus) {
        return;
      }
      await sleep(20);
    }

    throw new Error(
      `Session ${sessionId} did not reach ${expectedStatus} before timeout`,
    );
  }
});

function createScriptedGatewayClient(script: {
  onImplement: Record<string, unknown>;
  onPlan: Record<string, unknown>;
  onVerify: Record<string, unknown>;
}): AgentGatewayClient {
  let runtimeIndex = 0;
  const eventStore = new Map<string, AgentGatewayEventEnvelope[]>();

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
      runtimeIndex += 1;
      const sessionId = `runtime-${runtimeIndex}`;
      eventStore.set(sessionId, []);
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
      const events = eventStore.get(sessionId) ?? [];
      const index = cursor
        ? events.findIndex((event) => event.cursor === cursor)
        : -1;
      const sliced = index >= 0 ? events.slice(index + 1) : events;

      return {
        cursor: cursor ?? null,
        events: sliced,
        nextCursor: sliced.at(-1)?.cursor ?? cursor ?? null,
        session: {
          sessionId,
          state: events.some((event) => event.type === 'error')
            ? 'FAILED'
            : events.some((event) => event.type === 'complete')
              ? 'COMPLETED'
              : 'RUNNING',
        },
      };
    },
    async prompt(sessionId, input) {
      const payload = resolveScriptPayload(script, input.input);
      eventStore.set(sessionId, [
        {
          type: 'status',
          cursor: `${sessionId}:1`,
          data: {
            state: 'RUNNING',
          },
        },
        {
          type: 'delta',
          cursor: `${sessionId}:2`,
          data: {
            text: JSON.stringify(payload),
          },
        },
        {
          type: 'complete',
          cursor: `${sessionId}:3`,
          data: {
            reason: 'done',
          },
        },
      ]);

      return {
        accepted: true,
        runtime: {
          provider: 'codex',
        },
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

function resolveScriptPayload(
  script: {
    onImplement: Record<string, unknown>;
    onPlan: Record<string, unknown>;
    onVerify: Record<string, unknown>;
  },
  prompt: string,
) {
  if (prompt.includes('planner for a local orchestration workflow')) {
    return script.onPlan;
  }
  if (prompt.includes('implementation specialist for a local orchestration workflow')) {
    return script.onImplement;
  }
  return script.onVerify;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
