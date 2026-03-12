import { State } from '@hateoas-ts/resource';
import { AcpSessionSummary } from '@shared/schema';
import { Button } from '@shared/ui';
import { FolderTreeIcon, PanelLeftCloseIcon } from 'lucide-react';
import { SessionList, SessionTreeNode } from '@features/project-sessions';

export function ProjectSessionHistorySidebar(props: {
  onCollapse: () => void;
  onDeleteSession: (session: State<AcpSessionSummary>) => void;
  onOpenRename: (session: State<AcpSessionSummary>) => void;
  onSelectSession: (session: State<AcpSessionSummary>) => void;
  projectTitle: string;
  selectedSessionId?: string;
  sessions: SessionTreeNode[];
  sessionsLoading: boolean;
}) {
  const {
    onCollapse,
    onDeleteSession,
    onOpenRename,
    onSelectSession,
    projectTitle,
    selectedSessionId,
    sessions,
    sessionsLoading,
  } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FolderTreeIcon className="size-3.5 shrink-0 text-primary" />
          <span className="truncate text-xs text-muted-foreground">
            {projectTitle}
          </span>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onCollapse}>
          <PanelLeftCloseIcon />
          <span className="sr-only">收起侧栏</span>
        </Button>
      </div>

      <SessionList
        loading={sessionsLoading}
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        onDelete={onDeleteSession}
        onOpenRename={onOpenRename}
        onSelect={onSelectSession}
      />
    </div>
  );
}
