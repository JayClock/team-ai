import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AcpStreamBroker,
  type AcpRuntimeClient,
} from '@orchestration/runtime-acp';
import { initializeDatabase } from '../db/sqlite';
import { createProject } from './project-service';
import {
  createAcpSession,
  listAcpSessionHistory,
  runAcpSessionSupervisionTick,
} from './acp-service';

describe('acp service supervision', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('moves inactive running sessions into cancelling and requests runtime cancel', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const broker = new AcpStreamBroker();
    const runtime = createRuntimeStub();
    const project = await createProject(sqlite, {
      repoPath: process.cwd(),
      title: 'ACP Supervision Inactive',
    });
    const created = await createAcpSession(
      sqlite,
      broker,
      runtime,
      {
        actorUserId: 'desktop-user',
        projectId: project.id,
        provider: 'codex',
      },
      {},
    );
    const pastActivityAt = '2026-03-18T10:00:00.000Z';
    const now = new Date('2026-03-18T10:00:03.000Z');
    const policy = {
      ...created.supervisionPolicy,
      inactivityTimeoutMs: 1_000,
      cancelGraceMs: 500,
    };

    sqlite
      .prepare(
        `
          UPDATE project_acp_sessions
          SET state = 'RUNNING',
              supervision_policy_json = ?,
              deadline_at = NULL,
              inactive_deadline_at = ?,
              last_activity_at = ?,
              cancel_requested_at = NULL,
              timeout_scope = NULL,
              updated_at = ?
          WHERE id = ?
        `,
      )
      .run(
        JSON.stringify(policy),
        '2026-03-18T10:00:01.000Z',
        pastActivityAt,
        pastActivityAt,
        created.id,
      );

    const result = await runAcpSessionSupervisionTick(
      sqlite,
      broker,
      runtime,
      { now },
    );

    expect(result).toEqual({
      checkedSessionIds: [created.id],
      forcedSessionIds: [],
      timedOutSessionIds: [created.id],
    });
    expect(runtime.cancelSession).toHaveBeenCalledWith({
      localSessionId: created.id,
      reason: 'ACP session exceeded its inactivity budget.',
    });

    const stored = sqlite
      .prepare(
        `
          SELECT state, timeout_scope, cancel_requested_at
          FROM project_acp_sessions
          WHERE id = ?
        `,
      )
      .get(created.id) as {
      cancel_requested_at: string | null;
      state: string;
      timeout_scope: string | null;
    };
    expect(stored.state).toBe('CANCELLING');
    expect(stored.timeout_scope).toBe('session_inactive');
    expect(stored.cancel_requested_at).toBe(now.toISOString());

    const history = await listAcpSessionHistory(
      sqlite,
      project.id,
      created.id,
      50,
    );
    expect(
      history.filter(
        (event) =>
          event.update.eventType === 'supervision_update' &&
          event.update.supervision?.stage === 'timeout_detected',
      ),
    ).toHaveLength(1);
    expect(
      history.filter(
        (event) =>
          event.update.eventType === 'supervision_update' &&
          event.update.supervision?.stage === 'cancel_requested',
      ),
    ).toHaveLength(1);
    expect(
      history.some(
        (event) =>
          event.update.eventType === 'lifecycle_update' &&
          event.update.lifecycle?.state === 'cancelling',
      ),
    ).toBe(true);
  });

  it('force-kills cancelling sessions that exceed cancel grace', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const broker = new AcpStreamBroker();
    const runtime = createRuntimeStub();
    const project = await createProject(sqlite, {
      repoPath: process.cwd(),
      title: 'ACP Supervision Force Kill',
    });
    const created = await createAcpSession(
      sqlite,
      broker,
      runtime,
      {
        actorUserId: 'desktop-user',
        projectId: project.id,
        provider: 'codex',
      },
      {},
    );
    const cancelRequestedAt = '2026-03-18T11:00:00.000Z';
    const now = new Date('2026-03-18T11:00:03.000Z');
    const policy = {
      ...created.supervisionPolicy,
      cancelGraceMs: 1_000,
    };

    sqlite
      .prepare(
        `
          UPDATE project_acp_sessions
          SET state = 'CANCELLING',
              supervision_policy_json = ?,
              cancel_requested_at = ?,
              timeout_scope = 'session_total',
              failure_reason = 'ACP session exceeded its total runtime budget.',
              updated_at = ?
          WHERE id = ?
        `,
      )
      .run(
        JSON.stringify(policy),
        cancelRequestedAt,
        cancelRequestedAt,
        created.id,
      );

    const result = await runAcpSessionSupervisionTick(
      sqlite,
      broker,
      runtime,
      { now },
    );

    expect(result).toEqual({
      checkedSessionIds: [created.id],
      forcedSessionIds: [created.id],
      timedOutSessionIds: [],
    });
    expect(runtime.killSession).toHaveBeenCalledWith(created.id);

    const stored = sqlite
      .prepare(
        `
          SELECT
            state,
            timeout_scope,
            force_killed_at,
            completed_at,
            failure_reason
          FROM project_acp_sessions
          WHERE id = ?
        `,
      )
      .get(created.id) as {
      completed_at: string | null;
      failure_reason: string | null;
      force_killed_at: string | null;
      state: string;
      timeout_scope: string | null;
    };
    expect(stored.state).toBe('FAILED');
    expect(stored.timeout_scope).toBe('session_total');
    expect(stored.force_killed_at).toBe(now.toISOString());
    expect(stored.completed_at).toBe(now.toISOString());
    expect(stored.failure_reason).toContain('force-killing runtime');

    const history = await listAcpSessionHistory(
      sqlite,
      project.id,
      created.id,
      50,
    );
    expect(
      history.filter(
        (event) =>
          event.update.eventType === 'supervision_update' &&
          event.update.supervision?.stage === 'cancel_grace_expired',
      ),
    ).toHaveLength(1);
    expect(
      history.filter(
        (event) =>
          event.update.eventType === 'supervision_update' &&
          event.update.supervision?.stage === 'force_killed',
      ),
    ).toHaveLength(1);
    expect(
      history.some(
        (event) =>
          event.update.eventType === 'lifecycle_update' &&
          event.update.lifecycle?.state === 'force_killed',
      ),
    ).toBe(true);
  });

  it('cancels sessions that exceed the configured step budget', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const broker = new AcpStreamBroker();
    const runtime = createRuntimeStub();
    const project = await createProject(sqlite, {
      repoPath: process.cwd(),
      title: 'ACP Step Budget',
    });
    const created = await createAcpSession(
      sqlite,
      broker,
      runtime,
      {
        actorUserId: 'desktop-user',
        projectId: project.id,
        provider: 'codex',
      },
      {},
    );
    const policy = {
      ...created.supervisionPolicy,
      maxSteps: 1,
    };

    sqlite
      .prepare(
        `
          UPDATE project_acp_sessions
          SET state = 'RUNNING',
              supervision_policy_json = ?,
              step_count = 0,
              updated_at = ?
          WHERE id = ?
        `,
      )
      .run(
        JSON.stringify(policy),
        '2026-03-18T12:00:00.000Z',
        created.id,
      );

    const createSessionCalls = runtime.createSession.mock.calls as Array<
      [
        {
          hooks: {
            onSessionUpdate(update: {
              eventType: string;
              provider: string;
              rawNotification: unknown;
              sessionId: string;
              timestamp: string;
              toolCall?: {
                content: unknown[];
                inputFinalized: boolean;
                locations: unknown[];
                output?: unknown;
                status: 'completed' | 'failed' | 'pending' | 'running';
              };
              traceId?: string;
            }): Promise<void>;
          };
        },
      ]
    >;
    const hooks = createSessionCalls[0]?.[0].hooks;
    expect(hooks).toBeDefined();

    await hooks?.onSessionUpdate({
      eventType: 'tool_call',
      provider: 'codex',
      rawNotification: null,
      sessionId: created.id,
      timestamp: '2026-03-18T12:00:01.000Z',
      toolCall: {
        content: [],
        inputFinalized: true,
        locations: [],
        output: 'first tool result',
        status: 'completed',
      },
    });
    await hooks?.onSessionUpdate({
      eventType: 'tool_call',
      provider: 'codex',
      rawNotification: null,
      sessionId: created.id,
      timestamp: '2026-03-18T12:00:02.000Z',
      toolCall: {
        content: [],
        inputFinalized: true,
        locations: [],
        output: 'second tool result',
        status: 'completed',
      },
    });

    expect(runtime.cancelSession).toHaveBeenCalledWith({
      localSessionId: created.id,
      reason: 'ACP session exceeded step budget (2/1).',
    });

    const stored = sqlite
      .prepare(
        `
          SELECT state, timeout_scope, step_count, cancel_requested_at
          FROM project_acp_sessions
          WHERE id = ?
        `,
      )
      .get(created.id) as {
      cancel_requested_at: string | null;
      state: string;
      step_count: number;
      timeout_scope: string | null;
    };
    expect(stored.state).toBe('CANCELLING');
    expect(stored.timeout_scope).toBe('step_budget');
    expect(stored.step_count).toBe(2);
    expect(stored.cancel_requested_at).not.toBeNull();

    const history = await listAcpSessionHistory(
      sqlite,
      project.id,
      created.id,
      50,
    );
    expect(
      history.filter(
        (event) =>
          event.update.eventType === 'supervision_update' &&
          event.update.supervision?.scope === 'step_budget' &&
          event.update.supervision?.stage === 'timeout_detected',
      ),
    ).toHaveLength(1);
    expect(
      history.some(
        (event) =>
          event.update.eventType === 'lifecycle_update' &&
          event.update.lifecycle?.state === 'cancelling',
      ),
    ).toBe(true);
  });
});

async function createTestDatabase(cleanupTasks: Array<() => Promise<void>>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-acp-service-'));
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

function createRuntimeStub(): AcpRuntimeClient & {
  cancelSession: ReturnType<typeof vi.fn>;
  killSession: ReturnType<typeof vi.fn>;
} {
  return {
    cancelSession: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createSession: vi.fn(async (input) => ({
      cwd: input.cwd,
      isBusy: false,
      lastTouchedAt: new Date().toISOString(),
      localSessionId: input.localSessionId,
      provider: input.provider,
      runtimeSessionId: 'runtime-1',
    })),
    isConfigured: vi.fn(() => true),
    isSessionActive: vi.fn(() => true),
    killSession: vi.fn(async () => undefined),
    listSessions: vi.fn(() => []),
    loadSession: vi.fn(async (input) => ({
      cwd: input.cwd,
      isBusy: false,
      lastTouchedAt: new Date().toISOString(),
      localSessionId: input.localSessionId,
      provider: input.provider,
      runtimeSessionId: input.runtimeSessionId,
    })),
    promptSession: vi.fn(async () => ({
      response: {
        stopReason: 'end_turn' as const,
      },
      runtimeSessionId: 'runtime-1',
    })),
  };
}
