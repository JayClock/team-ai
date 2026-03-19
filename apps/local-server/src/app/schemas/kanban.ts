import type { TaskKind } from './task';

export type KanbanColumnStage =
  | 'backlog'
  | 'todo'
  | 'dev'
  | 'review'
  | 'blocked'
  | 'done';

export interface KanbanColumnAutomationPayload {
  autoAdvanceOnSuccess: boolean;
  enabled: boolean;
  provider: string | null;
  requiredArtifacts: string[];
  specialistId: string | null;
  transitionType: 'both' | 'entry' | 'exit';
}

export interface KanbanCardSummaryPayload {
  assignedRole: string | null;
  assignedSpecialistName: string | null;
  boardId: string | null;
  columnId: string | null;
  executionSessionId: string | null;
  id: string;
  kind: TaskKind | null;
  lastSyncError: string | null;
  position: number | null;
  priority: string | null;
  resultSessionId: string | null;
  status: string;
  title: string;
  triggerSessionId: string | null;
  updatedAt: string;
  verificationVerdict: string | null;
}

export interface KanbanColumnPayload {
  automation: KanbanColumnAutomationPayload | null;
  boardId: string;
  cards?: KanbanCardSummaryPayload[];
  id: string;
  name: string;
  position: number;
  stage: KanbanColumnStage | null;
}

export interface KanbanBoardPayload {
  columns: KanbanColumnPayload[];
  createdAt: string;
  id: string;
  name: string;
  projectId: string;
  updatedAt: string;
}

export interface KanbanBoardListPayload {
  items: KanbanBoardPayload[];
  projectId: string;
}
