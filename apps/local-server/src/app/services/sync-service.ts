import type { Database } from 'better-sqlite3';
import { ProblemError } from '@orchestration/runtime-acp';
import { and, count, desc, eq, gt, isNull } from 'drizzle-orm';
import { getDrizzleDb } from '../db/drizzle';
import {
  projectAgentsTable,
  projectsTable,
  syncConflictsTable,
  syncStateTable,
} from '../db/schema';
import type {
  SyncConflictListPayload,
  SyncConflictPayload,
  SyncConflictResolution,
  SyncRuntimeStatus,
  SyncStatusPayload,
} from '../schemas/sync';
import { getSettings } from './settings-service';

interface SyncStateRow {
  last_error: string | null;
  last_run_at: string | null;
  last_successful_sync_at: string | null;
  paused: boolean;
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
  const db = getDrizzleDb(sqlite);
  const existing = db
    .select({
      status: syncStateTable.status,
      paused: syncStateTable.paused,
      last_run_at: syncStateTable.lastRunAt,
      last_successful_sync_at: syncStateTable.lastSuccessfulSyncAt,
      last_error: syncStateTable.lastError,
      updated_at: syncStateTable.updatedAt,
    })
    .from(syncStateTable)
    .where(eq(syncStateTable.id, 1))
    .get() as SyncStateRow | undefined;

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();

  db.insert(syncStateTable)
    .values({
      id: 1,
      status: 'idle',
      paused: false,
      lastRunAt: null,
      lastSuccessfulSyncAt: null,
      lastError: null,
      updatedAt: now,
    });

  return {
    status: 'idle',
    paused: false,
    last_run_at: null,
    last_successful_sync_at: null,
    last_error: null,
    updated_at: now,
  };
}

function countUpdatedProjectsSince(sqlite: Database, timestamp: string | null) {
  const row = getDrizzleDb(sqlite)
    .select({ count: count() })
    .from(projectsTable)
    .where(
      timestamp
        ? and(isNull(projectsTable.deletedAt), gt(projectsTable.updatedAt, timestamp))
        : isNull(projectsTable.deletedAt),
    )
    .get() as { count: number };

  return row.count;
}

function countUpdatedProjectAgentsSince(
  sqlite: Database,
  timestamp: string | null,
) {
  const row = getDrizzleDb(sqlite)
    .select({ count: count() })
    .from(projectAgentsTable)
    .where(
      timestamp
        ? and(
            isNull(projectAgentsTable.deletedAt),
            gt(projectAgentsTable.updatedAt, timestamp),
          )
        : isNull(projectAgentsTable.deletedAt),
    )
    .get() as { count: number };

  return row.count;
}

function countPendingChanges(sqlite: Database, lastSuccessfulSyncAt: string | null) {
  return (
    countUpdatedProjectsSince(sqlite, lastSuccessfulSyncAt) +
    countUpdatedProjectAgentsSince(sqlite, lastSuccessfulSyncAt)
  );
}

function countOpenConflicts(sqlite: Database) {
  const row = getDrizzleDb(sqlite)
    .select({ count: count() })
    .from(syncConflictsTable)
    .where(eq(syncConflictsTable.status, 'open'))
    .get() as { count: number };

  return row.count;
}

function readConflictRow(sqlite: Database, conflictId: string): SyncConflictRow {
  const row = getDrizzleDb(sqlite)
    .select({
      id: syncConflictsTable.id,
      resource_type: syncConflictsTable.resourceType,
      resource_id: syncConflictsTable.resourceId,
      title: syncConflictsTable.title,
      local_summary: syncConflictsTable.localSummary,
      remote_summary: syncConflictsTable.remoteSummary,
      status: syncConflictsTable.status,
      resolution: syncConflictsTable.resolution,
      created_at: syncConflictsTable.createdAt,
      updated_at: syncConflictsTable.updatedAt,
    })
    .from(syncConflictsTable)
    .where(eq(syncConflictsTable.id, conflictId))
    .get() as SyncConflictRow | undefined;

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
    paused: patch.paused ?? current.paused,
    lastRunAt:
      patch.lastRunAt === undefined ? current.last_run_at : patch.lastRunAt,
    lastSuccessfulSyncAt:
      patch.lastSuccessfulSyncAt === undefined
        ? current.last_successful_sync_at
        : patch.lastSuccessfulSyncAt,
    lastError: patch.lastError === undefined ? current.last_error : patch.lastError,
    updatedAt: new Date().toISOString(),
  };

  getDrizzleDb(sqlite)
    .update(syncStateTable)
    .set({
      status: next.status,
      paused: next.paused,
      lastRunAt: next.lastRunAt,
      lastSuccessfulSyncAt: next.lastSuccessfulSyncAt,
      lastError: next.lastError,
      updatedAt: next.updatedAt,
    })
    .where(eq(syncStateTable.id, 1))
    .run();
}

function maybeSeedSyntheticConflict(sqlite: Database) {
  const existingOpenConflicts = countOpenConflicts(sqlite);

  if (existingOpenConflicts > 0) {
    return;
  }
}

export async function getSyncStatus(sqlite: Database): Promise<SyncStatusPayload> {
  const settings = await getSettings(sqlite);
  const row = ensureSyncState(sqlite);

  return {
    status: row.status,
    paused: row.paused,
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
  const rows = getDrizzleDb(sqlite)
    .select({
      id: syncConflictsTable.id,
      resource_type: syncConflictsTable.resourceType,
      resource_id: syncConflictsTable.resourceId,
      title: syncConflictsTable.title,
      local_summary: syncConflictsTable.localSummary,
      remote_summary: syncConflictsTable.remoteSummary,
      status: syncConflictsTable.status,
      resolution: syncConflictsTable.resolution,
      created_at: syncConflictsTable.createdAt,
      updated_at: syncConflictsTable.updatedAt,
    })
    .from(syncConflictsTable)
    .where(eq(syncConflictsTable.status, 'open'))
    .orderBy(desc(syncConflictsTable.updatedAt))
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

  getDrizzleDb(sqlite)
    .update(syncConflictsTable)
    .set({
      status: 'resolved',
      resolution,
      updatedAt,
    })
    .where(
      and(
        eq(syncConflictsTable.id, conflictId),
        eq(syncConflictsTable.status, 'open'),
      ),
    )
    .run();

  return mapConflictRow(readConflictRow(sqlite, conflictId));
}
