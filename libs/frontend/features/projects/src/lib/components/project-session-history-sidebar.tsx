import { State } from '@hateoas-ts/resource';
import { AcpSessionSummary } from '@shared/schema';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@shared/ui';
import {
  BookTextIcon,
  FolderTreeIcon,
  RadioTowerIcon,
  WorkflowIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  countSessionTree,
  SessionList,
  SessionTreeNode,
} from '@features/project-sessions';
import {
  formatStatusLabel,
  WorkbenchProjectInsights,
} from './project-session-workbench.shared';

export function ProjectSessionHistorySidebar(props: {
  contextSummary: WorkbenchProjectInsights;
  onDeleteSession: (session: State<AcpSessionSummary>) => void;
  onOpenRename: (session: State<AcpSessionSummary>) => void;
  onSelectSession: (session: State<AcpSessionSummary>) => void;
  projectTitle: string;
  selectedSessionId?: string;
  selectedSessionMeta: {
    label: string;
    provider: string | null;
    state: string | null;
  } | null;
  sessions: SessionTreeNode[];
  sessionsLoading: boolean;
}) {
  const {
    contextSummary,
    onDeleteSession,
    onOpenRename,
    onSelectSession,
    projectTitle,
    selectedSessionId,
    selectedSessionMeta,
    sessions,
    sessionsLoading,
  } = props;
  const totalSessions = sessions.reduce(
    (count, node) => count + countSessionTree(node),
    0,
  );

  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarHeader className="gap-3 border-b border-sidebar-border px-3 py-3">
        <div className="rounded-2xl border border-sidebar-border/80 bg-sidebar-accent/30 p-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FolderTreeIcon className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/60">
                Project Console
              </p>
              <p className="truncate text-sm font-semibold text-sidebar-foreground">
                {projectTitle}
              </p>
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="pb-0">
          <SidebarGroupLabel>Workspace Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="grid grid-cols-2 gap-2 px-2 pb-2">
              <SidebarMetricCard
                icon={<FolderTreeIcon className="size-3.5" />}
                label="Sessions"
                value={String(totalSessions)}
              />
              <SidebarMetricCard
                icon={<BookTextIcon className="size-3.5" />}
                label="Notes"
                value={String(contextSummary.noteCount)}
              />
              <SidebarMetricCard
                icon={<RadioTowerIcon className="size-3.5" />}
                label="Task Runs"
                value={String(contextSummary.taskRunCount)}
              />
              <SidebarMetricCard
                icon={<WorkflowIcon className="size-3.5" />}
                label="Mode"
                value={
                  contextSummary.runtimeProfile?.orchestrationMode ?? 'ROUTA'
                }
              />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
          <SessionList
            loading={sessionsLoading}
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            onDelete={onDeleteSession}
            onOpenRename={onOpenRename}
            onSelect={onSelectSession}
          />
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="h-auto items-start rounded-2xl border border-sidebar-border/80 bg-sidebar-accent/40 px-3 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/60">
                    Active Session
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-sidebar-foreground">
                    {selectedSessionMeta?.label ?? '未选择会话'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] text-sidebar-foreground/70">
                  <span className="rounded-full bg-background/80 px-2 py-1">
                    {formatStatusLabel(selectedSessionMeta?.state)}
                  </span>
                  <span className="rounded-full bg-background/80 px-2 py-1">
                    {selectedSessionMeta?.provider ?? 'provider 未设置'}
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function SidebarMetricCard(props: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  const { icon, label, value } = props;

  return (
    <div className="rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/25 p-3">
      <div className="flex items-center gap-2 text-sidebar-foreground/70">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-[0.16em]">
          {label}
        </span>
      </div>
      <div className="mt-3 truncate text-base font-semibold text-sidebar-foreground">
        {value}
      </div>
    </div>
  );
}
