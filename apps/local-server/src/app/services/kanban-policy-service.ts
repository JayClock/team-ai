import { customAlphabet } from 'nanoid';
import { ProblemError } from '@orchestration/runtime-acp';
import type { KanbanBoardPayload, KanbanColumnPayload } from '../schemas/kanban';
import type { TaskPayload } from '../schemas/task';
import { evaluateTaskArtifactGate } from './task-artifact-gate-service';

const policyAuditId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

export interface KanbanPolicyViolation {
  code:
    | 'allowed_source_columns'
    | 'board_wip_limit'
    | 'manual_approval_required'
    | 'required_artifacts';
  message: string;
}

interface EvaluateKanbanTransitionPolicyInput {
  board: KanbanBoardPayload;
  sourceColumnId: string | null;
  targetColumn: KanbanColumnPayload;
  task: TaskPayload;
}

function isWipStage(stage: KanbanColumnPayload['stage']) {
  return stage !== null && stage !== 'backlog' && stage !== 'done';
}

function findColumn(board: KanbanBoardPayload, columnId: string | null) {
  if (!columnId) {
    return null;
  }

  return board.columns.find((column) => column.id === columnId) ?? null;
}

function countActiveWip(board: KanbanBoardPayload) {
  return board.columns.reduce((total, column) => {
    if (!isWipStage(column.stage)) {
      return total;
    }

    return total + (column.cards?.length ?? 0);
  }, 0);
}

export function evaluateKanbanAutomationStartPolicy(input: {
  board: KanbanBoardPayload;
  column: KanbanColumnPayload;
}): KanbanPolicyViolation[] {
  const violations: KanbanPolicyViolation[] = [];
  const activeWip = countActiveWip(input.board);

  if (input.column.automation?.manualApprovalRequired) {
    violations.push({
      code: 'manual_approval_required',
      message: `${input.column.name} requires manual approval before automation can start.`,
    });
  }

  if (
    typeof input.board.settings.wipLimit === 'number' &&
    activeWip > input.board.settings.wipLimit
  ) {
    violations.push({
      code: 'board_wip_limit',
      message: `Board WIP limit reached (${input.board.settings.wipLimit}). Automation stays queued until work-in-progress drops.`,
    });
  }

  return violations;
}

function buildAllowedSourceMessage(
  board: KanbanBoardPayload,
  allowedSourceColumnIds: string[],
) {
  const labels = allowedSourceColumnIds.map((columnId) => {
    return findColumn(board, columnId)?.name ?? columnId;
  });
  return `Only cards from ${labels.join(', ')} can enter this column.`;
}

export function evaluateKanbanTransitionPolicy(
  input: EvaluateKanbanTransitionPolicyInput,
): KanbanPolicyViolation[] {
  const { board, sourceColumnId, targetColumn, task } = input;
  const sourceColumn = findColumn(board, sourceColumnId);
  const violations: KanbanPolicyViolation[] = [];
  const allowedSourceColumnIds =
    targetColumn.automation?.allowedSourceColumnIds ?? [];

  if (
    allowedSourceColumnIds.length > 0 &&
    (!sourceColumnId || !allowedSourceColumnIds.includes(sourceColumnId))
  ) {
    violations.push({
      code: 'allowed_source_columns',
      message: buildAllowedSourceMessage(board, allowedSourceColumnIds),
    });
  }

  if (targetColumn.automation?.manualApprovalRequired) {
    violations.push({
      code: 'manual_approval_required',
      message: `${targetColumn.name} requires manual approval before a card can enter.`,
    });
  }

  const increasesBoardWip =
    !isWipStage(sourceColumn?.stage ?? null) && isWipStage(targetColumn.stage);
  const activeWip = countActiveWip(board);
  if (
    increasesBoardWip &&
    typeof board.settings.wipLimit === 'number' &&
    activeWip >= board.settings.wipLimit
  ) {
    violations.push({
      code: 'board_wip_limit',
      message: `Board WIP limit reached (${board.settings.wipLimit}). Move work forward before pulling another card into progress.`,
    });
  }

  const artifactGate = evaluateTaskArtifactGate(task, targetColumn);
  if (artifactGate.gated && artifactGate.message) {
    violations.push({
      code: 'required_artifacts',
      message: artifactGate.message,
    });
  }

  return violations;
}

export function assertKanbanTransitionPolicy(
  input: EvaluateKanbanTransitionPolicyInput,
) {
  const violations = evaluateKanbanTransitionPolicy(input);
  if (violations.length === 0) {
    return violations;
  }

  throw new ProblemError({
    detail: violations.map((violation) => violation.message).join(' '),
    status: 409,
    title: 'Kanban Policy Blocked Transition',
    type: 'https://team-ai.dev/problems/kanban-policy-violation',
  });
}

export function appendKanbanPolicyBypassAudit(
  task: TaskPayload,
  input: {
    reason: string;
    sourceColumnId: string | null;
    targetColumnId: string | null;
    violations: KanbanPolicyViolation[];
  },
) {
  const now = new Date().toISOString();
  const summary = [
    `Bypass reason: ${input.reason}`,
    ...input.violations.map((violation) => `Violation: ${violation.message}`),
  ].join('\n');

  return [
    ...task.laneHandoffs,
    {
      fromColumnId: input.sourceColumnId ?? undefined,
      fromSessionId: task.triggerSessionId ?? 'system',
      id: `handoff_${policyAuditId()}`,
      request: `Policy bypass approved while moving ${task.title}`,
      requestType: 'policy_bypass' as const,
      requestedAt: now,
      respondedAt: now,
      responseSummary: summary,
      status: 'completed' as const,
      toColumnId: input.targetColumnId ?? undefined,
      toSessionId: 'system',
    },
  ];
}

export function getKanbanPolicyViolationMessage(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'detail' in error &&
    typeof error.detail === 'string'
  ) {
    return error.detail;
  }

  return error instanceof Error ? error.message : 'Kanban policy blocked transition.';
}
