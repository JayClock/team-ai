import type { Database } from 'better-sqlite3';
import { getDrizzleDb } from '../db/drizzle';
import { projectAcpSessionsTable } from '../db/schema';

interface InsertAcpSessionInput {
  agentId?: string | null;
  actorId?: string;
  cwd?: string;
  id: string;
  name?: string | null;
  parentSessionId?: string | null;
  projectId: string;
  provider?: string;
  startedAt?: string | null;
  state?: string;
  taskId?: string | null;
}

export function insertAcpSession(
  sqlite: Database,
  input: InsertAcpSessionInput,
) {
  const now = new Date().toISOString();

  getDrizzleDb(sqlite)
    .insert(projectAcpSessionsTable)
    .values({
      acpError: null,
      acpStatus: 'ready',
      actorId: input.actorId ?? 'desktop-user',
      agentId: input.agentId ?? null,
      cancelRequestedAt: null,
      cancelledAt: null,
      codebaseId: null,
      completedAt: null,
      createdAt: now,
      cwd: input.cwd ?? '/tmp',
      deadlineAt: null,
      deletedAt: null,
      failureReason: null,
      forceKilledAt: null,
      id: input.id,
      inactiveDeadlineAt: null,
      lastActivityAt: input.startedAt ?? now,
      lastEventId: null,
      model: null,
      name: input.name ?? null,
      parentSessionId: input.parentSessionId ?? null,
      projectId: input.projectId,
      provider: input.provider ?? 'codex',
      runtimeSessionId: null,
      specialistId: null,
      startedAt: input.startedAt ?? now,
      state: input.state ?? 'RUNNING',
      stepCount: 0,
      supervisionPolicyJson:
        '{"promptTimeoutMs":300000,"inactivityTimeoutMs":600000,"totalTimeoutMs":1800000,"cancelGraceMs":1000,"completionGraceMs":1000,"providerInitTimeoutMs":10000,"packageManagerInitTimeoutMs":120000,"maxSteps":64,"maxRetries":0}',
      taskId: input.taskId ?? null,
      timeoutScope: null,
      updatedAt: now,
      worktreeId: null,
    })
    .run();
}
