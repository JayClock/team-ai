import type { Database } from 'better-sqlite3';
import type { SessionStatus } from '../schemas/orchestration';
import type { ProjectHomePayload } from '../schemas/project-home';
import { listOrchestrationSessions } from './orchestration-service';
import { getProjectById } from './project-service';

const activeStatuses = new Set<SessionStatus>([
  'PENDING',
  'PLANNING',
  'RUNNING',
  'PAUSED',
]);

export async function getProjectHome(
  sqlite: Database,
  projectId: string,
): Promise<ProjectHomePayload> {
  const project = await getProjectById(sqlite, projectId);
  const recentSessionsPayload = await listOrchestrationSessions(sqlite, {
    page: 1,
    pageSize: 5,
    projectId,
  });
  const allSessionsPayload = await listOrchestrationSessions(sqlite, {
    page: 1,
    pageSize: 100,
    projectId,
  });

  const recentSessions = recentSessionsPayload.items;
  const latestSession = recentSessions[0] ?? null;

  return {
    project,
    activeSessionCount: allSessionsPayload.items.filter((session) =>
      activeStatuses.has(session.status),
    ).length,
    latestSession,
    recentSessions,
    lastActivityAt:
      latestSession?.lastEventAt ?? latestSession?.updatedAt ?? project.updatedAt,
    recommendedEntry: 'sessions',
  };
}
