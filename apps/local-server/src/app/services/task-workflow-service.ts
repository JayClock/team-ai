import type { TaskKind } from '../schemas/task';

export type TaskWorkflowColumnStage =
  | 'backlog'
  | 'todo'
  | 'dev'
  | 'review'
  | 'blocked'
  | 'done';

export interface TaskWorkflowColumnDefinition {
  description: string;
  id: string;
  name: string;
  recommendedRole: 'ROUTA' | 'CRAFTER' | 'GATE';
  recommendedSpecialistId: string;
  recommendedSpecialistName: string;
  stage: TaskWorkflowColumnStage;
}

export const defaultTaskWorkflowBoardId = 'workflow-default';

export const defaultTaskWorkflowColumns: TaskWorkflowColumnDefinition[] = [
  {
    description: 'Coordinator-owned backlog and planning work.',
    id: 'backlog',
    name: 'Backlog',
    recommendedRole: 'ROUTA',
    recommendedSpecialistId: 'routa-coordinator',
    recommendedSpecialistName: 'Routa Coordinator',
    stage: 'backlog',
  },
  {
    description: 'Ready implementation work waiting to be picked up.',
    id: 'todo',
    name: 'Todo',
    recommendedRole: 'CRAFTER',
    recommendedSpecialistId: 'crafter-implementor',
    recommendedSpecialistName: 'Crafter Implementor',
    stage: 'todo',
  },
  {
    description: 'Implementation work currently executing.',
    id: 'dev',
    name: 'Dev',
    recommendedRole: 'CRAFTER',
    recommendedSpecialistId: 'crafter-implementor',
    recommendedSpecialistName: 'Crafter Implementor',
    stage: 'dev',
  },
  {
    description: 'Review and verification work.',
    id: 'review',
    name: 'Review',
    recommendedRole: 'GATE',
    recommendedSpecialistId: 'gate-reviewer',
    recommendedSpecialistName: 'Gate Reviewer',
    stage: 'review',
  },
  {
    description: 'Blocked or retrying work that needs intervention.',
    id: 'blocked',
    name: 'Blocked',
    recommendedRole: 'ROUTA',
    recommendedSpecialistId: 'routa-coordinator',
    recommendedSpecialistName: 'Routa Coordinator',
    stage: 'blocked',
  },
  {
    description: 'Completed work with final evidence recorded.',
    id: 'done',
    name: 'Done',
    recommendedRole: 'GATE',
    recommendedSpecialistId: 'gate-reviewer',
    recommendedSpecialistName: 'Gate Reviewer',
    stage: 'done',
  },
];

function isReviewLikeTask(kind: TaskKind | null | undefined) {
  return kind === 'review' || kind === 'verify';
}

export function resolveTaskWorkflowColumnId(input: {
  kind: TaskKind | null | undefined;
  status: string | null | undefined;
}) {
  const normalizedStatus = input.status?.trim().toUpperCase() ?? 'PENDING';

  switch (normalizedStatus) {
    case 'COMPLETED':
      return 'done';
    case 'RUNNING':
      return isReviewLikeTask(input.kind) ? 'review' : 'dev';
    case 'FAILED':
    case 'CANCELLED':
    case 'WAITING_RETRY':
    case 'BLOCKED':
      return 'blocked';
    default:
      if (input.kind === 'plan') {
        return 'backlog';
      }

      return isReviewLikeTask(input.kind) ? 'review' : 'todo';
  }
}

export function resolveTaskWorkflowContext(input: {
  boardId?: string | null;
  columnId?: string | null;
  kind: TaskKind | null | undefined;
  status: string | null | undefined;
}) {
  return {
    boardId: input.boardId ?? defaultTaskWorkflowBoardId,
    columnId:
      input.columnId ?? resolveTaskWorkflowColumnId(input),
  };
}

export function getTaskWorkflowColumnDefinition(columnId: string | null | undefined) {
  if (!columnId) {
    return null;
  }

  return (
    defaultTaskWorkflowColumns.find((column) => column.id === columnId) ?? null
  );
}

export function resolveTaskWorkflowColumnStage(
  columnId: string | null | undefined,
  columnName?: string | null,
): TaskWorkflowColumnStage | null {
  const normalizedId = columnId?.trim().toLowerCase() ?? '';
  const normalizedName = columnName?.trim().toLowerCase() ?? '';

  const matches = (value: string, candidate: string) =>
    value === candidate || value.endsWith(`_${candidate}`);

  if (matches(normalizedId, 'backlog') || normalizedName === 'backlog') {
    return 'backlog';
  }

  if (matches(normalizedId, 'todo') || normalizedName === 'todo') {
    return 'todo';
  }

  if (matches(normalizedId, 'dev') || normalizedName === 'dev') {
    return 'dev';
  }

  if (matches(normalizedId, 'review') || normalizedName === 'review') {
    return 'review';
  }

  if (matches(normalizedId, 'blocked') || normalizedName === 'blocked') {
    return 'blocked';
  }

  if (matches(normalizedId, 'done') || normalizedName === 'done') {
    return 'done';
  }

  return null;
}

export function resolveTaskStatusForWorkflowColumn(
  columnId: string | null | undefined,
  columnName: string | null | undefined,
  currentStatus: string,
) {
  const stage = resolveTaskWorkflowColumnStage(columnId, columnName);

  switch (stage) {
    case 'backlog':
    case 'todo':
      return 'PENDING';
    case 'dev':
      return 'READY';
    case 'review':
      return 'PENDING';
    case 'blocked':
      return 'WAITING_RETRY';
    case 'done':
      return 'COMPLETED';
    default:
      return currentStatus;
  }
}
