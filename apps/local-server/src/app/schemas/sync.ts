export type SyncRuntimeStatus = 'idle' | 'running' | 'paused' | 'error';

export type SyncConflictStatus = 'open' | 'resolved';

export type SyncConflictResolution =
  | 'keep-local'
  | 'keep-remote'
  | 'mark-reviewed';

export interface SyncStatusPayload {
  conflictCount: number;
  lastError: string | null;
  lastRunAt: string | null;
  lastSuccessfulSyncAt: string | null;
  paused: boolean;
  pendingChanges: number;
  status: SyncRuntimeStatus;
  syncEnabled: boolean;
  updatedAt: string;
}

export interface SyncConflictPayload {
  createdAt: string;
  id: string;
  localSummary: string;
  remoteSummary: string;
  resolution: SyncConflictResolution | null;
  resourceId: string;
  resourceType: string;
  status: SyncConflictStatus;
  title: string;
  updatedAt: string;
}

export interface SyncConflictListPayload {
  items: SyncConflictPayload[];
  total: number;
}
