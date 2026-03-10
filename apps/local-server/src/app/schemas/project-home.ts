import type { OrchestrationSessionPayload } from './orchestration';
import type { ProjectPayload } from './project';

export interface ProjectHomePayload {
  activeSessionCount: number;
  lastActivityAt: string | null;
  latestSession: OrchestrationSessionPayload | null;
  project: ProjectPayload;
  recentSessions: OrchestrationSessionPayload[];
  recommendedEntry: 'sessions';
}
