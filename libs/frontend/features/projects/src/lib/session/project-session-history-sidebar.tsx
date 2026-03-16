import { State } from '@hateoas-ts/resource';
import { AcpSessionSummary } from '@shared/schema';
import { FolderTreeIcon } from 'lucide-react';
import type { ComponentType } from 'react';
// eslint-disable-next-line @nx/enforce-module-boundaries -- source import keeps the local workbench prop contract aligned during the phase 7 upgrade
import { SessionList } from '../../../../project-sessions/src/lib/session-list';
// eslint-disable-next-line @nx/enforce-module-boundaries -- source import keeps the local workbench prop contract aligned during the phase 7 upgrade
import { SessionTreeNode } from '../../../../project-sessions/src/lib/session-tree';

const SessionListWithAnnotations = SessionList as ComponentType<{
  loading: boolean;
  onSelect: (session: State<AcpSessionSummary>) => void;
  selectedSessionId?: string;
  sessionAnnotationsById?: Record<string, string[]>;
  sessions: SessionTreeNode[];
}>;

export function ProjectSessionHistorySidebar(props: {
  onSelectSession: (session: State<AcpSessionSummary>) => void;
  projectTitle: string;
  selectedSessionId?: string;
  sessionAnnotationsById?: Record<string, string[]>;
  sessions: SessionTreeNode[];
  sessionsLoading: boolean;
}) {
  const {
    onSelectSession,
    projectTitle,
    selectedSessionId,
    sessionAnnotationsById,
    sessions,
    sessionsLoading,
  } = props;

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
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <SessionListWithAnnotations
          loading={sessionsLoading}
          sessions={sessions}
          sessionAnnotationsById={sessionAnnotationsById}
          selectedSessionId={selectedSessionId}
          onSelect={onSelectSession}
        />
      </div>
    </div>
  );
}
