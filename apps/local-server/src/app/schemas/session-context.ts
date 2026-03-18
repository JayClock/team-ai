import type { AcpSessionPayload } from '@orchestration/runtime-acp';
import type { KanbanColumnPayload } from './kanban';
import type {
  TaskLaneHandoffPayload,
  TaskLaneSessionPayload,
  TaskPayload,
} from './task';
import type { WorktreePayload } from './worktree';

export interface SessionRelatedLaneHandoffPayload
  extends TaskLaneHandoffPayload {
  direction: 'incoming' | 'outgoing';
  fromColumnName?: string;
  toColumnName?: string;
}

export interface SessionKanbanContextPayload {
  boardColumns: KanbanColumnPayload[];
  boardId: string | null;
  boardName: string | null;
  columnId: string | null;
  columnName: string | null;
  currentLaneSession: TaskLaneSessionPayload | null;
  previousLaneSession: TaskLaneSessionPayload | null;
  relatedHandoffs: SessionRelatedLaneHandoffPayload[];
  taskId: string;
  taskTitle: string;
  triggerSessionId: string | null;
}

export interface AcpSessionContextPayload {
  kanban: SessionKanbanContextPayload | null;
  projectId: string;
  session: AcpSessionPayload;
  sessionId: string;
  task: TaskPayload | null;
  worktree: WorktreePayload | null;
}
