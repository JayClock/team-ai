export interface KanbanColumnAutomationPayload {
  autoAdvanceOnSuccess: boolean;
  enabled: boolean;
  provider: string | null;
  requiredArtifacts: string[];
  specialistId: string | null;
  transitionType: 'both' | 'entry' | 'exit';
}

export interface KanbanColumnPayload {
  automation: KanbanColumnAutomationPayload | null;
  boardId: string;
  id: string;
  name: string;
  position: number;
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
