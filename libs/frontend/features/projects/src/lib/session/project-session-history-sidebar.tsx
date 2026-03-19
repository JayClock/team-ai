import { State } from '@hateoas-ts/resource';
import { AcpSessionSummary, Project } from '@shared/schema';
import { SessionList } from '@features/project-sessions';
import { FolderTreeIcon } from 'lucide-react';

const SessionListWithAnnotations = SessionList;

export function ProjectSessionHistorySidebar(props: {
  initialSessionId?: string;
  onSelectSession: (
    session: State<AcpSessionSummary>,
    options?: { navigate?: boolean },
  ) => void;
  onSessionListRefreshReady?: (
    refresh: () => Promise<State<AcpSessionSummary>[]>,
  ) => void;
  onWorkbenchSessionIdChange?: (sessionId: string | undefined) => void;
  projectState: State<Project>;
  projectTitle: string;
  selectedSessionId?: string;
  sessionAnnotationsById?: Record<string, string[]>;
}) {
  const {
    initialSessionId,
    onSelectSession,
    onSessionListRefreshReady,
    onWorkbenchSessionIdChange,
    projectState,
    projectTitle,
    selectedSessionId,
    sessionAnnotationsById,
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
          initialSessionId={initialSessionId}
          onSelect={onSelectSession}
          onRefreshReady={onSessionListRefreshReady}
          onRootSessionIdChange={onWorkbenchSessionIdChange}
          projectState={projectState}
          selectedSessionId={selectedSessionId}
          sessionAnnotationsById={sessionAnnotationsById}
        />
      </div>
    </div>
  );
}
