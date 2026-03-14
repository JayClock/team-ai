import type { Database } from 'better-sqlite3';
import type { DiagnosticLogger } from '../diagnostics';

interface PlanTaskDispatchCallbacks {
  createSession(input: {
    actorUserId: string;
    goal?: string;
    parentSessionId?: string | null;
    projectId: string;
    provider: string;
    role?: string | null;
    specialistId?: string;
    taskId?: string | null;
  }): Promise<{ id: string }>;
  isProviderAvailable?(provider: string): Promise<boolean> | boolean;
  promptSession(input: {
    projectId: string;
    prompt: string;
    sessionId: string;
  }): Promise<unknown>;
}

interface PlanEntryInput {
  content: string;
  priority?: 'high' | 'medium' | 'low' | null;
  status?: 'pending' | 'in_progress' | 'completed' | null;
}

export interface SyncPlanEventToTasksInput {
  emittedAt: string;
  entries: PlanEntryInput[];
  eventId: string;
  sessionId: string;
}

export interface SyncPlanEventToTasksResult {
  createdCount: number;
  skipped: boolean;
}

export interface SyncPlanEventAutoDispatchAttempt {
  dispatched: boolean;
  errorMessage: string | null;
  reason:
    | 'DISPATCH_ERROR'
    | 'TASK_ALREADY_DISPATCHING'
    | 'TASK_NOT_DISPATCHABLE'
    | null;
  sessionId: string | null;
  taskId: string;
}

export interface SyncPlanEventAutoDispatchResult {
  attempted: boolean;
  dispatchedCount: number;
  eligible: boolean;
  results: SyncPlanEventAutoDispatchAttempt[];
  skippedReason:
    | 'NO_NEW_TASKS'
    | 'PLAN_SYNC_SKIPPED'
    | 'SESSION_NOT_TOP_LEVEL_ROUTA'
    | null;
}

export interface SyncPlanEventToTasksAndDispatchResult
  extends SyncPlanEventToTasksResult {
  autoDispatch: SyncPlanEventAutoDispatchResult;
}

export interface SyncPlanEventToTasksAndDispatchOptions {
  logger?: DiagnosticLogger;
}

// ACP plan events no longer materialize project tasks. Keep this compatibility
// layer so older call sites and replay tests get explicit "skipped" semantics.
export function syncPlanEventToTasks(
  sqlite: Database,
  input: SyncPlanEventToTasksInput,
): SyncPlanEventToTasksResult {
  void sqlite;
  void input;
  return {
    createdCount: 0,
    skipped: true,
  };
}

export async function syncPlanEventToTasksAndDispatch(
  sqlite: Database,
  callbacks: PlanTaskDispatchCallbacks,
  input: SyncPlanEventToTasksInput,
  options: SyncPlanEventToTasksAndDispatchOptions = {},
): Promise<SyncPlanEventToTasksAndDispatchResult> {
  void sqlite;
  void callbacks;
  void input;
  void options;
  return {
    createdCount: 0,
    skipped: true,
    autoDispatch: {
      attempted: false,
      dispatchedCount: 0,
      eligible: false,
      results: [],
      skippedReason: 'PLAN_SYNC_SKIPPED',
    },
  };
}
