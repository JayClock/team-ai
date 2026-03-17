import { describe, expect, it } from 'vitest';
import type { TaskPayload } from '../schemas/task';
import {
  createTaskLaneHandoff,
  markTaskLaneSessionStatus,
  upsertTaskLaneHandoff,
  upsertTaskLaneSession,
} from './task-lane-service';

function createTask(): TaskPayload {
  return {
    acceptanceCriteria: [],
    assignedProvider: null,
    assignedRole: 'CRAFTER',
    assignedSpecialistId: null,
    assignedSpecialistName: null,
    assignee: null,
    boardId: 'workflow-default',
    codebaseId: null,
    codebaseIds: [],
    columnId: 'workflow-default_dev',
    completionSummary: null,
    createdAt: '2026-03-17T00:00:00.000Z',
    dependencies: [],
    executionSessionId: null,
    githubId: null,
    githubNumber: null,
    githubRepo: null,
    githubState: null,
    githubSyncedAt: null,
    githubUrl: null,
    id: 'task_lane_1',
    kind: 'implement',
    labels: [],
    laneHandoffs: [],
    laneSessions: [],
    lastSyncError: null,
    objective: 'Implement the task lane helpers',
    parallelGroup: null,
    parentTaskId: null,
    position: 1,
    priority: null,
    projectId: 'proj_lane',
    resultSessionId: null,
    sessionId: null,
    sessionIds: [],
    scope: null,
    sourceEntryIndex: null,
    sourceEventId: null,
    sourceType: 'manual',
    status: 'READY',
    title: 'Lane task',
    triggerSessionId: null,
    updatedAt: '2026-03-17T00:00:00.000Z',
    verificationCommands: [],
    verificationReport: null,
    verificationVerdict: null,
    workspaceId: 'proj_lane',
    worktreeId: null,
  };
}

describe('task lane service', () => {
  it('upserts lane sessions and can mark them completed', () => {
    const task = createTask();

    const first = upsertTaskLaneSession(task, {
      columnId: 'workflow-default_dev',
      columnName: 'Dev',
      role: 'CRAFTER',
      sessionId: 'acps_lane_1',
    });
    const updated = upsertTaskLaneSession(task, {
      columnId: 'workflow-default_dev',
      columnName: 'Dev',
      provider: 'codex',
      sessionId: 'acps_lane_1',
      specialistName: 'Backend Crafter',
    });
    const completed = markTaskLaneSessionStatus(
      task,
      'acps_lane_1',
      'completed',
    );

    expect(first).toMatchObject({
      sessionId: 'acps_lane_1',
      status: 'completed',
    });
    expect(updated).toMatchObject({
      provider: 'codex',
      specialistName: 'Backend Crafter',
    });
    expect(completed).toMatchObject({
      completedAt: expect.any(String),
      status: 'completed',
    });
    expect(task.laneSessions).toHaveLength(1);
  });

  it('creates and upserts lane handoffs', () => {
    const task = createTask();
    const handoff = createTaskLaneHandoff({
      fromColumnId: 'workflow-default_dev',
      fromSessionId: 'acps_dev',
      id: 'handoff_1',
      request: 'Please verify the implementation result.',
      requestType: 'clarification',
      toColumnId: 'workflow-default_review',
      toSessionId: 'acps_review',
    });

    upsertTaskLaneHandoff(task, handoff);
    upsertTaskLaneHandoff(task, {
      ...handoff,
      responseSummary: 'Verification plan acknowledged.',
      respondedAt: '2026-03-17T00:05:00.000Z',
      status: 'delivered',
    });

    expect(task.laneHandoffs).toEqual([
      expect.objectContaining({
        id: 'handoff_1',
        responseSummary: 'Verification plan acknowledged.',
        status: 'delivered',
      }),
    ]);
  });
});
