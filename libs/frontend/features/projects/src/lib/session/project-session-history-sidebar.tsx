import { State } from '@hateoas-ts/resource';
import { SessionList, SessionTreeNode } from '@features/project-sessions';
import { AcpSessionSummary } from '@shared/schema';
import { FolderTreeIcon } from 'lucide-react';
import {
  countSessionTree,
  formatDateTime,
  formatStatusLabel,
} from './project-session-workbench.shared';

export function ProjectSessionHistorySidebar(props: {
  onOpenTaskContext?: (session: State<AcpSessionSummary>) => void;
  onSelectSession: (session: State<AcpSessionSummary>) => void;
  projectTitle: string;
  selectedSessionId?: string;
  selectedSessionMeta: {
    hierarchyLabel?: string | null;
    label: string;
    lastActivityAt?: string | null;
    provider: string | null;
    specialistId?: string | null;
    status: string | null;
    taskId?: string | null;
  } | null;
  sessionQuickActions?: {
    activityCount: number;
    completedCount: number;
    failedCount: number;
    runningCount: number;
    taskCount: number;
  } | null;
  sessions: SessionTreeNode[];
  sessionsLoading: boolean;
}) {
  const {
    onOpenTaskContext,
    onSelectSession,
    projectTitle,
    selectedSessionId,
    selectedSessionMeta,
    sessionQuickActions,
    sessions,
    sessionsLoading,
  } = props;
  const totalSessions = sessions.reduce(
    (count, node) => count + countSessionTree(node),
    0,
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border/60 px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FolderTreeIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Project
            </p>
            <p className="truncate text-sm font-semibold">{projectTitle}</p>
          </div>
          <span className="shrink-0 rounded-full border border-border/70 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
            {totalSessions}
          </span>
        </div>

        {selectedSessionMeta ? (
          <div className="mt-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
            <p className="truncate text-sm font-medium">
              {selectedSessionMeta.label}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {selectedSessionMeta.hierarchyLabel ? (
                <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                  {selectedSessionMeta.hierarchyLabel}
                </span>
              ) : null}
              <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                {formatStatusLabel(selectedSessionMeta.status)}
              </span>
              <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                {selectedSessionMeta.provider ?? '未配置 provider'}
              </span>
              {selectedSessionMeta.specialistId ? (
                <span className="rounded-full border border-border/60 bg-background px-2 py-1 font-mono">
                  {selectedSessionMeta.specialistId}
                </span>
              ) : null}
              {selectedSessionMeta.taskId ? (
                <span className="rounded-full border border-border/60 bg-background px-2 py-1 font-mono">
                  {selectedSessionMeta.taskId}
                </span>
              ) : null}
            </div>

            {selectedSessionMeta.lastActivityAt ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                最近活动 {formatDateTime(selectedSessionMeta.lastActivityAt)}
              </p>
            ) : null}

            {sessionQuickActions ? (
              <div className="mt-3 rounded-xl border border-border/60 bg-background/80 p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Session Snapshot
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {sessionQuickActions.taskCount} 个任务 ·{' '}
                      {sessionQuickActions.activityCount} 条活动
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                      {sessionQuickActions.completedCount} 完成
                    </span>
                    <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                      {sessionQuickActions.runningCount} 进行中
                    </span>
                    <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                      {sessionQuickActions.failedCount} 失败
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        <SessionList
          loading={sessionsLoading}
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onOpenTaskContext={onOpenTaskContext}
          onSelect={onSelectSession}
        />
      </div>
    </div>
  );
}
