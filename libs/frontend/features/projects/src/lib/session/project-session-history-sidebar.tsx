import { State } from '@hateoas-ts/resource';
import { SessionList, SessionTreeNode } from '@features/project-sessions';
import { AcpSessionSummary } from '@shared/schema';
import { FolderTreeIcon } from 'lucide-react';

export function ProjectSessionHistorySidebar(props: {
  onSelectSession: (session: State<AcpSessionSummary>) => void;
  projectTitle: string;
  selectedSessionId?: string;
  sessions: SessionTreeNode[];
  sessionsLoading: boolean;
}) {
  const {
    onSelectSession,
    projectTitle,
    selectedSessionId,
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
        <SessionList
          loading={sessionsLoading}
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onSelect={onSelectSession}
        />
      </div>
    </div>
  );
}
