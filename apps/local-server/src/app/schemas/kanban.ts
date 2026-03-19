import type {
  TaskKind,
  TaskLaneHandoffPayload,
  TaskLaneSessionPayload,
} from './task';

export type KanbanColumnStage =
  | 'backlog'
  | 'todo'
  | 'dev'
  | 'review'
  | 'blocked'
  | 'done';

export interface KanbanColumnAutomationPayload {
  allowedSourceColumnIds: string[];
  autoAdvanceOnSuccess: boolean;
  enabled: boolean;
  manualApprovalRequired: boolean;
  provider: string | null;
  requiredArtifacts: string[];
  role: string | null;
  specialistName: string | null;
  specialistId: string | null;
  transitionType: 'both' | 'entry' | 'exit';
}

export interface KanbanCardExplainPayload {
  currentColumnReason: string;
  decisionLog: string[];
  latestAutomationResult: string | null;
  missingArtifacts: string[];
  recentTransitionReason: string | null;
}

export interface KanbanCardMemoryPayload {
  blockers: string[];
  decisions: string[];
  doneSummary: string | null;
  resolvedNotes: string[];
}

export interface KanbanCardTraceLinkPayload {
  lastCapturedAt: string | null;
  latestSummary: string | null;
  sessionId: string;
  traceId: string | null;
  total: number;
}

export interface KanbanCardSummaryPayload {
  assignedRole: string | null;
  assignedSpecialistName: string | null;
  artifactEvidence: string[];
  boardId: string | null;
  columnId: string | null;
  completionSummary: string | null;
  executionSessionId: string | null;
  githubNumber: number | null;
  githubRepo: string | null;
  githubState: string | null;
  githubUrl: string | null;
  id: string;
  kind: TaskKind | null;
  laneHandoffs: TaskLaneHandoffPayload[];
  laneSessions: TaskLaneSessionPayload[];
  lastSyncError: string | null;
  memory: KanbanCardMemoryPayload;
  explain: KanbanCardExplainPayload | null;
  position: number | null;
  priority: string | null;
  recentOutputSummary: string | null;
  resultSessionId: string | null;
  sourceEventId: string | null;
  sourceType: string;
  status: string;
  title: string;
  traceLinks: KanbanCardTraceLinkPayload[];
  triggerSessionId: string | null;
  updatedAt: string;
  verificationReport: string | null;
  verificationVerdict: string | null;
}

export interface KanbanColumnPayload {
  automation: KanbanColumnAutomationPayload | null;
  boardId: string;
  cards?: KanbanCardSummaryPayload[];
  id: string;
  name: string;
  position: number;
  recommendedRole: string | null;
  recommendedSpecialistId: string | null;
  recommendedSpecialistName: string | null;
  stage: KanbanColumnStage | null;
}

export interface KanbanBoardSettingsPayload {
  boardConcurrency: number | null;
  isDefault: boolean;
  wipLimit: number | null;
}

export interface KanbanBoardPayload {
  columns: KanbanColumnPayload[];
  createdAt: string;
  id: string;
  name: string;
  projectId: string;
  settings: KanbanBoardSettingsPayload;
  updatedAt: string;
}

export interface KanbanBoardListPayload {
  items: KanbanBoardPayload[];
  projectId: string;
}
