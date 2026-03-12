import type { Database } from 'better-sqlite3';

interface InsertAcpSessionInput {
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

  sqlite
    .prepare(
      `
        INSERT INTO project_acp_sessions (
          id,
          project_id,
          actor_id,
          parent_session_id,
          name,
          provider,
          state,
          runtime_session_id,
          failure_reason,
          last_event_id,
          started_at,
          last_activity_at,
          completed_at,
          created_at,
          updated_at,
          deleted_at,
          cwd,
          agent_id,
          specialist_id,
          task_id
        )
        VALUES (
          @id,
          @projectId,
          @actorId,
          @parentSessionId,
          @name,
          @provider,
          @state,
          NULL,
          NULL,
          NULL,
          @startedAt,
          @lastActivityAt,
          NULL,
          @createdAt,
          @updatedAt,
          NULL,
          @cwd,
          NULL,
          NULL,
          @taskId
        )
      `,
    )
    .run({
      actorId: input.actorId ?? 'desktop-user',
      createdAt: now,
      cwd: input.cwd ?? '/tmp',
      id: input.id,
      lastActivityAt: input.startedAt ?? now,
      name: input.name ?? null,
      parentSessionId: input.parentSessionId ?? null,
      projectId: input.projectId,
      provider: input.provider ?? 'codex',
      startedAt: input.startedAt ?? now,
      state: input.state ?? 'RUNNING',
      taskId: input.taskId ?? null,
      updatedAt: now,
    });
}
