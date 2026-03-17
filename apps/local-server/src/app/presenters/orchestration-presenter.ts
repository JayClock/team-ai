import type { AcpSessionPayload } from '../schemas/acp';
import type { TaskPayload } from '../schemas/task';
import type { TaskRunPayload } from '../schemas/task-run';
import { presentAcpSession } from './acp-presenter';
import { presentTask } from './task-presenter';
import { presentTaskRun } from './task-run-presenter';

export interface OrchestrationSummarySessionNode {
  childSessionIds: string[];
  parentSessionId: string | null;
  sessionId: string;
  taskId: string | null;
}

export interface OrchestrationSummaryDelegationGroup {
  callerSessionId: string;
  completedCount: number;
  failureCount: number;
  groupId: string;
  parentSessionId: string | null;
  pendingCount: number;
  sessionIds: string[];
  settled: boolean;
  status: 'OPEN' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  taskIds: string[];
  totalCount: number;
}

export interface OrchestrationSummaryPayload {
  delegationGroups: OrchestrationSummaryDelegationGroup[];
  focusSessionId: string | null;
  projectId: string;
  rootSessionId: string | null;
  sessionTree: OrchestrationSummarySessionNode[];
  sessions: AcpSessionPayload[];
  taskRuns: TaskRunPayload[];
  tasks: TaskPayload[];
}

export function presentOrchestrationSummary(
  payload: OrchestrationSummaryPayload,
) {
  const searchParams = new URLSearchParams();

  if (payload.focusSessionId) {
    searchParams.set('sessionId', payload.focusSessionId);
  }

  const query = searchParams.toString();

  return {
    _links: {
      self: {
        href: `/api/projects/${payload.projectId}/orchestration-summary${
          query ? `?${query}` : ''
        }`,
      },
      project: {
        href: `/api/projects/${payload.projectId}`,
      },
      root: {
        href: '/api',
      },
    },
    _embedded: {
      delegationGroups: payload.delegationGroups,
      sessions: payload.sessions.map((session) => presentAcpSession(session)),
      taskRuns: payload.taskRuns.map((taskRun) => presentTaskRun(taskRun)),
      tasks: payload.tasks.map((task) => presentTask(task)),
    },
    focusSessionId: payload.focusSessionId,
    projectId: payload.projectId,
    rootSessionId: payload.rootSessionId,
    sessionTree: payload.sessionTree,
  };
}
