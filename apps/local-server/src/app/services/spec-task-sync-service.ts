import type { Database } from 'better-sqlite3';
import type { NotePayload } from '../schemas/note';
import type { TaskKind } from '../schemas/task';

export interface ParsedSpecTaskBlock {
  acceptanceCriteria: string[];
  index: number;
  kind: TaskKind;
  objective: string;
  raw: string;
  scope: string | null;
  title: string;
  verificationCommands: string[];
}

export interface SyncSpecTaskItemResult {
  action: 'skipped';
  reason: 'SPEC_TASK_SYNC_DISABLED';
  taskId: string;
}

export interface SyncSpecTasksResult {
  createdCount: number;
  deletedCount: number;
  parsedCount: number;
  skipped: boolean;
  skippedCount: number;
  tasks: SyncSpecTaskItemResult[];
  updatedCount: number;
}

export type SpecTaskSyncSnapshotStatus = 'clean';

export interface SpecTaskSyncSnapshotItem {
  blockIndex: number;
  expectedTaskTitle: string;
  reason: 'SPEC_TASK_SYNC_DISABLED';
  taskId: string | null;
}

export interface SpecTaskSyncSnapshot {
  conflictCount: number;
  items: SpecTaskSyncSnapshotItem[];
  matchedCount: number;
  noteId: string;
  orphanedTaskCount: number;
  parseError: string | null;
  parsedCount: number;
  pendingCount: number;
  skipped: true;
  status: SpecTaskSyncSnapshotStatus;
  taskCount: number;
}

// Spec notes no longer materialize project tasks. Keep the legacy API surface
// as a compatibility shim so routes and MCP callers receive explicit skipped
// semantics instead of silently mutating tasks.
export function parseSpecTaskBlocks(content: string): ParsedSpecTaskBlock[] {
  void content;
  return [];
}

export function getSpecNoteTaskSyncSnapshot(
  sqlite: Database,
  note: NotePayload,
): SpecTaskSyncSnapshot {
  void sqlite;
  return {
    conflictCount: 0,
    items: [],
    matchedCount: 0,
    noteId: note.id,
    orphanedTaskCount: 0,
    parseError: null,
    parsedCount: 0,
    pendingCount: 0,
    skipped: true,
    status: 'clean',
    taskCount: 0,
  };
}

export async function syncSpecNoteToTasks(
  sqlite: Database,
  note: NotePayload,
): Promise<SyncSpecTasksResult> {
  void sqlite;
  void note;
  return {
    createdCount: 0,
    deletedCount: 0,
    parsedCount: 0,
    skipped: true,
    skippedCount: 0,
    tasks: [],
    updatedCount: 0,
  };
}
