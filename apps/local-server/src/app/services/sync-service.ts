import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
import type {
  SyncConflictListPayload,
  SyncConflictPayload,
  SyncConflictResolution,
  SyncRuntimeStatus,
  SyncStatusPayload,
} from '../schemas/sync';
import { getSettings } from './settings-service';

const conflictIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface SyncStateRow {
  last_error: string | null;
  last_run_at: string | null;
  last_successful_sync_at: string | null;
  paused: number;
  status: SyncRuntimeStatus;
  updated_at: string;
}

interface SyncConflictRow {
  created_at: string;
  id: string;
  local_summary: string;
  remote_summary: string;
  resolution: SyncConflictResolution | null;
  resource_id: string;
  resource_type: string;
  status: SyncConflictPayload['status'];
  title: string;
  updated_at: string;
}

function createConflictId() {
  return `syncc_${conflictIdGenerator()}`;
}

function throwConflictNotFound(conflictId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/sync-conflict-not-found',
    title: 'Sync Conflict Not Found',
    status: 404,
    detail: `Sync conflict ${conflictId} was not found`,
  });
}

function throwInvalidSyncState(detail: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/invalid-sync-state',
    title: 'Invalid Sync State',
    status: 409,
    detail,
  });
}

function mapConflictRow(row: SyncConflictRow): SyncConflictPayload {
  return {
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    title: row.title,
    localSummary: row.local_summary,
    remoteSummary: row.remote_summary,
    status: row.status,
    resolution: row.resolution,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ensureSyncState(sqlite: Database): SyncStateRow {
  const existing = sqlite
    .prepare(
      `
        SELECT
          status,
          paused,
          last_run_at,
          last_successful_sync_at,
          last_error,
          updated_at
        FROM sync_state
        WHERE id = 1
      `,
    )
    .get() as SyncStateRow | undefined;

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();

  sqlite
    .prepare(
      `
        INSERT INTO sync_state (
          id,
          status,
          paused,
          last_run_at,
          last_successful_sync_at,
          last_error,
          updated_at
        )
        VALUES (1, 'idle', 0, NULL, NULL, NULL, @updatedAt)
      `,
    )
    .run({
      updatedAt: now,
    });

  return {
    status: 'idle',
    paused: 0,
    last_run_at: null,
    last_successful_sync_at: null,
    last_error: null,
    updated_at: now,
  };
}

function countUpdatedSince(
  sqlite: Database,
  table: string,
  timestamp: string | null,
  options?: {
    deletedColumn?: string;
    hasSoftDelete?: boolean;
  },
) {
  const hasSoftDelete = options?.hasSoftDelete ?? true;
  const deletedFilter = hasSoftDelete
    ? `${options?.deletedColumn ?? 'deleted_at'} IS NULL AND `
    : '';
  const query = timestamp
    ? `
        SELECT COUNT(*) AS count
        FROM ${table}
        WHERE ${deletedFilter}updated_at > @timestamp
      `
    : `
        SELECT COUNT(*) AS count
        FROM ${table}
        WHERE ${deletedFilter}1 = 1
      `;

  const row = sqlite
    .prepare(query)
    .get(timestamp ? { timestamp } : {}) as { count: number };

  return row.count;
}

function countPendingChanges(sqlite: Database, lastSuccessfulSyncAt: string | null) {
  return (
    countUpdatedSince(sqlite, 'projects', lastSuccessfulSyncAt) +
    countUpdatedSince(sqlite, 'agents', lastSuccessfulSyncAt) +
    countUpdatedSince(sqlite, 'orchestration_sessions', lastSuccessfulSyncAt, {
      hasSoftDelete: false,
    })
  );
}

function countOpenConflicts(sqlite: Database) {
  const row = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM sync_conflicts
        WHERE status = 'open'
      `,
    )
    .get() as { count: number };

  return row.count;
}

function readConflictRow(sqlite: Database, conflictId: string): SyncConflictRow {
  const row = sqlite
    .prepare(
      `
        SELECT
          id,
          resource_type,
          resource_id,
          title,
          local_summary,
          remote_summary,
          status,
          resolution,
          created_at,
          updated_at
        FROM sync_conflicts
        WHERE id = ?
      `,
    )
    .get(conflictId) as SyncConflictRow | undefined;

  if (!row) {
    throwConflictNotFound(conflictId);
  }

  return row;
}

function updateSyncState(
  sqlite: Database,
  patch: Partial<{
    lastError: string | null;
    lastRunAt: string | null;
    lastSuccessfulSyncAt: string | null;
    paused: boolean;
    status: SyncRuntimeStatus;
  }>,
) {
  const current = ensureSyncState(sqlite);
  const next = {
    status: patch.status ?? current.status,
    paused: patch.paused ?? Boolean(current.paused),
    lastRunAt:
      patch.lastRunAt === undefined ? current.last_run_at : patch.lastRunAt,
    lastSuccessfulSyncAt:
      patch.lastSuccessfulSyncAt === undefined
        ? current.last_successful_sync_at
        : patch.lastSuccessfulSyncAt,
    lastError: patch.lastError === undefined ? current.last_error : patch.lastError,
    updatedAt: new Date().toISOString(),
  };

  sqlite
    .prepare(
      `
        UPDATE sync_state
        SET
          status = @status,
          paused = @paused,
          last_run_at = @lastRunAt,
          last_successful_sync_at = @lastSuccessfulSyncAt,
          last_error = @lastError,
          updated_at = @updatedAt
        WHERE id = 1
      `,
    )
    .run({
      status: next.status,
      paused: next.paused ? 1 : 0,
      lastRunAt: next.lastRunAt,
      lastSuccessfulSyncAt: next.lastSuccessfulSyncAt,
      lastError: next.lastError,
      updatedAt: next.updatedAt,
    });
}

function maybeSeedSyntheticConflict(sqlite: Database) {
  const existingOpenConflicts = countOpenConflicts(sqlite);

  if (existingOpenConflicts > 0) {
    return;
  }

  const candidate = sqlite
    .prepare(
      `
        SELECT id, title, updated_at
        FROM orchestration_sessions
        WHERE title LIKE '%[conflict]%'
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    )
    .get() as { id: string; title: string; updated_at: string } | undefined;

  if (!candidate) {
    return;
  }

  sqlite
    .prepare(
      `
        INSERT INTO sync_conflicts (
          id,
          resource_type,
          resource_id,
          title,
          local_summary,
          remote_summary,
          status,
          resolution,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          'orchestration-session',
          @resourceId,
          @title,
          @localSummary,
          @remoteSummary,
          'open',
          NULL,
          @createdAt,
          @updatedAt
        )
      `,
    )
    .run({
      id: createConflictId(),
      resourceId: candidate.id,
      title: `Conflict detected for ${candidate.title}`,
      localSummary: 'Local desktop orchestration differs from the remote snapshot.',
      remoteSummary: 'Remote snapshot contains a newer conflicting orchestration title.',
      createdAt: candidate.updated_at,
      updatedAt: candidate.updated_at,
    });
}

export async function getSyncStatus(sqlite: Database): Promise<SyncStatusPayload> {
  const settings = await getSettings(sqlite);
  const row = ensureSyncState(sqlite);

  return {
    status: row.status,
    paused: Boolean(row.paused),
    syncEnabled: settings.syncEnabled,
    lastRunAt: row.last_run_at,
    lastSuccessfulSyncAt: row.last_successful_sync_at,
    lastError: row.last_error,
    updatedAt: row.updated_at,
    pendingChanges: countPendingChanges(sqlite, row.last_successful_sync_at),
    conflictCount: countOpenConflicts(sqlite),
  };
}

export async function runSync(sqlite: Database): Promise<SyncStatusPayload> {
  const current = ensureSyncState(sqlite);

  if (current.paused) {
    throwInvalidSyncState('Sync is paused and must be resumed before running');
  }

  const now = new Date().toISOString();

  updateSyncState(sqlite, {
    status: 'running',
    lastRunAt: now,
    lastError: null,
  });

  maybeSeedSyntheticConflict(sqlite);

  updateSyncState(sqlite, {
    status: 'idle',
    lastRunAt: now,
    lastSuccessfulSyncAt: now,
    lastError: null,
  });

  return await getSyncStatus(sqlite);
}

export async function pauseSync(sqlite: Database): Promise<SyncStatusPayload> {
  updateSyncState(sqlite, {
    paused: true,
    status: 'paused',
    lastError: null,
  });

  return await getSyncStatus(sqlite);
}

export async function resumeSync(sqlite: Database): Promise<SyncStatusPayload> {
  updateSyncState(sqlite, {
    paused: false,
    status: 'idle',
    lastError: null,
  });

  return await getSyncStatus(sqlite);
}

export async function listSyncConflicts(
  sqlite: Database,
): Promise<SyncConflictListPayload> {
  const rows = sqlite
    .prepare(
      `
        SELECT
          id,
          resource_type,
          resource_id,
          title,
          local_summary,
          remote_summary,
          status,
          resolution,
          created_at,
          updated_at
        FROM sync_conflicts
        WHERE status = 'open'
        ORDER BY updated_at DESC
      `,
    )
    .all() as SyncConflictRow[];

  return {
    items: rows.map(mapConflictRow),
    total: rows.length,
  };
}

export async function resolveSyncConflict(
  sqlite: Database,
  conflictId: string,
  resolution: SyncConflictResolution,
): Promise<SyncConflictPayload> {
  const current = readConflictRow(sqlite, conflictId);

  if (current.status !== 'open') {
    throwInvalidSyncState(`Sync conflict ${conflictId} is already resolved`);
  }

  const updatedAt = new Date().toISOString();

  sqlite
    .prepare(
      `
        UPDATE sync_conflicts
        SET
          status = 'resolved',
          resolution = @resolution,
          updated_at = @updatedAt
        WHERE id = @id
      `,
    )
    .run({
      id: conflictId,
      resolution,
      updatedAt,
    });

  return mapConflictRow(readConflictRow(sqlite, conflictId));
}
