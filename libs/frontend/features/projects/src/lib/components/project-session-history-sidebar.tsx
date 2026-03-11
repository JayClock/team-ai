import { State } from '@hateoas-ts/resource';
import { AcpSessionSummary } from '@shared/schema';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui';
import {
  FolderTreeIcon,
  ListChecksIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PanelLeftCloseIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import { type RefObject, useMemo } from 'react';
import {
  countSessionTree,
  formatDateTime,
  formatStatusLabel,
  SessionTreeNode,
  sessionDisplayName,
  SidebarTab,
  statusChipClasses,
  statusTone,
  TaskSnapshotItem,
} from './project-session-workbench.shared';

export function ProjectSessionHistorySidebar(props: {
  activeTab: SidebarTab;
  leftSidebarRatio: number;
  onCollapse: () => void;
  onDeleteSession: (session: State<AcpSessionSummary>) => void;
  onOpenRename: (session: State<AcpSessionSummary>) => void;
  onSelectSession: (session: State<AcpSessionSummary>) => void;
  onStartSplitResize: () => void;
  onTabChange: (value: SidebarTab) => void;
  projectTitle: string;
  quickAccessVisible: boolean;
  selectedSessionId?: string;
  sessions: SessionTreeNode[];
  sessionsLoading: boolean;
  sessionsSplitRef: RefObject<HTMLDivElement | null>;
  taskItems: TaskSnapshotItem[];
}) {
  const {
    activeTab,
    leftSidebarRatio,
    onCollapse,
    onDeleteSession,
    onOpenRename,
    onSelectSession,
    onStartSplitResize,
    onTabChange,
    projectTitle,
    quickAccessVisible,
    selectedSessionId,
    sessions,
    sessionsLoading,
    sessionsSplitRef,
    taskItems,
  } = props;
  const totalSessions = useMemo(
    () => sessions.reduce((count, node) => count + countSessionTree(node), 0),
    [sessions],
  );
  const runningCount = taskItems.filter((item) =>
    ['RUNNING', 'running', 'in_progress'].includes(item.status),
  ).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FolderTreeIcon className="size-3.5 shrink-0 text-primary" />
          <span className="truncate text-xs text-muted-foreground">{projectTitle}</span>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onCollapse}>
          <PanelLeftCloseIcon />
          <span className="sr-only">收起侧栏</span>
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => onTabChange(value as SidebarTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b px-2 py-1.5">
          <TabsList className="grid h-auto w-full grid-cols-3 rounded-none bg-transparent p-0">
            <TabsTrigger
              value="sessions"
              className="gap-1.5 rounded-none border-b-2 border-transparent px-2 py-2 text-[11px] font-medium shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <MessageSquareTextIcon className="size-3.5" />
              会话
            </TabsTrigger>
            <TabsTrigger
              value="spec"
              className="gap-1.5 rounded-none border-b-2 border-transparent px-2 py-2 text-[11px] font-medium shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <FolderTreeIcon className="size-3.5" />
              规格
            </TabsTrigger>
            <TabsTrigger
              value="tasks"
              className="gap-1.5 rounded-none border-b-2 border-transparent px-2 py-2 text-[11px] font-medium shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <ListChecksIcon className="size-3.5" />
              任务
              {taskItems.length > 0 ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    runningCount > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {taskItems.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sessions" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="border-b px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              会话
            </p>
            <p className="mt-1 text-sm font-medium">共 {totalSessions} 个会话</p>
          </div>

          <div ref={sessionsSplitRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              className="min-h-0 overflow-hidden"
              style={
                quickAccessVisible ? { flexBasis: `${leftSidebarRatio * 100}%` } : undefined
              }
            >
              <ScrollArea className="h-full">
                <div className="space-y-2 p-3">
                  {sessionsLoading ? (
                    <p className="text-sm text-muted-foreground">正在加载会话...</p>
                  ) : sessions.length === 0 ? (
                    <Empty className="border-dashed px-4 py-10">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <MessageSquareTextIcon className="size-5" />
                        </EmptyMedia>
                        <EmptyTitle>还没有会话</EmptyTitle>
                        <EmptyDescription>
                          点击顶部“新建会话”开始第一个会话。
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    sessions.map((node) => (
                      <SessionTreeItem
                        key={node.session.data.id}
                        node={node}
                        selectedSessionId={selectedSessionId}
                        onDelete={onDeleteSession}
                        onOpenRename={onOpenRename}
                        onSelect={onSelectSession}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            {quickAccessVisible ? (
              <>
                <button
                  type="button"
                  className="hidden h-2 shrink-0 cursor-row-resize items-center justify-center border-y bg-muted/50 transition hover:bg-muted md:flex"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onStartSplitResize();
                  }}
                  data-testid="session-sidebar-split-handle"
                >
                  <div className="h-1 w-10 rounded-full bg-border" />
                </button>
                <div
                  className="min-h-52 shrink-0 border-t bg-background/80"
                  style={{ flexBasis: `${(1 - leftSidebarRatio) * 100}%` }}
                >
                  <QuickAccessPanel
                    taskItems={taskItems}
                    onOpenTasks={() => onTabChange('tasks')}
                  />
                </div>
              </>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="spec" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <SpecSidebarContent />
        </TabsContent>

        <TabsContent value="tasks" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <TasksSidebarContent taskItems={taskItems} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SpecSidebarContent() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          规格
        </p>
        <p className="mt-1 text-sm font-medium">规格内容</p>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <div className="w-full rounded-2xl border border-dashed bg-muted/30 px-4 py-10 text-center">
          <p className="text-sm font-medium">暂无规格内容</p>
        </div>
      </div>
    </div>
  );
}

function TasksSidebarContent(props: { taskItems: TaskSnapshotItem[] }) {
  const { taskItems } = props;
  const runningCount = taskItems.filter((item) =>
    ['RUNNING', 'running', 'in_progress'].includes(item.status),
  ).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          任务
        </p>
        <p className="mt-1 text-sm font-medium">
          {taskItems.length > 0 ? `共 ${taskItems.length} 项，${runningCount} 项进行中` : '暂无任务'}
        </p>
      </div>

      <ScrollArea className="h-full">
        <div className="space-y-2 p-3">
          {taskItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              还没有任务或计划项。
            </div>
          ) : (
            taskItems.map((item) => (
              <div key={item.id} className="rounded-2xl border bg-background px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`size-2 shrink-0 rounded-full ${statusTone(item.status)}`} />
                      <span className="truncate text-sm font-medium">{item.title}</span>
                    </div>
                    {item.description ? (
                      <p className="mt-2 text-xs text-muted-foreground">{item.description}</p>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${statusChipClasses(item.status)}`}
                  >
                    {formatStatusLabel(item.status)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SessionTreeItem(props: {
  node: SessionTreeNode;
  onDelete: (session: State<AcpSessionSummary>) => void;
  onOpenRename: (session: State<AcpSessionSummary>) => void;
  onSelect: (session: State<AcpSessionSummary>) => void;
  selectedSessionId?: string;
  depth?: number;
}) {
  const {
    node,
    onDelete,
    onOpenRename,
    onSelect,
    selectedSessionId,
    depth = 0,
  } = props;
  const active = node.session.data.id === selectedSessionId;

  return (
    <div className="space-y-2">
      <div
        className={`rounded-2xl border transition ${
          active ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-background'
        }`}
        style={{ marginLeft: depth * 14 }}
      >
        <div className="flex items-start gap-2 px-3 py-3">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => onSelect(node.session)}
          >
            <div className="flex min-w-0 items-center gap-2">
              <MessageSquareTextIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-medium">
                {sessionDisplayName(node.session)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>{formatStatusLabel(node.session.data.state)}</span>
              <span>{node.session.data.provider}</span>
              <span>{formatDateTime(node.session.data.lastActivityAt)}</span>
            </div>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontalIcon />
                <span className="sr-only">会话操作</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOpenRename(node.session)}>
                <PencilIcon />
                重命名
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(node.session)}
              >
                <Trash2Icon />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {node.children.length > 0 ? (
        <div className="space-y-2">
          {node.children.map((child) => (
            <SessionTreeItem
              key={child.session.data.id}
              node={child}
              depth={depth + 1}
              selectedSessionId={selectedSessionId}
              onDelete={onDelete}
              onOpenRename={onOpenRename}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function QuickAccessPanel(props: {
  taskItems: TaskSnapshotItem[];
  onOpenTasks: () => void;
}) {
  const { taskItems, onOpenTasks } = props;
  const runningCount = taskItems.filter((item) =>
    ['RUNNING', 'running', 'in_progress'].includes(item.status),
  ).length;
  const completedCount = taskItems.filter((item) =>
    ['COMPLETED', 'completed'].includes(item.status),
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b bg-muted/40 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              快速访问
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {`${taskItems.length} 个任务项${runningCount > 0 ? `，${runningCount} 个进行中` : ''}`}
            </p>
          </div>
          <Button variant="secondary" size="sm" className="h-7 px-2 text-[10px]" onClick={onOpenTasks}>
            打开任务
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              任务快照
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              共 {taskItems.length} 项
            </span>
            {runningCount > 0 ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                {runningCount} 个进行中
              </span>
            ) : null}
            {completedCount > 0 ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                {completedCount} 个已完成
              </span>
            ) : null}
          </div>
        </div>

        <ScrollArea className="h-[calc(100%-3.5rem)]">
          <div className="space-y-2 px-3 pb-3" data-testid="session-task-snapshot">
            {taskItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                还没有任务或计划项。
              </div>
            ) : (
              taskItems.map((item) => (
                <div
                  key={item.id}
                  data-testid="session-task-snapshot-item"
                  className="flex items-center gap-3 rounded-2xl border bg-background px-3 py-3"
                >
                  <span className={`size-2 shrink-0 rounded-full ${statusTone(item.status)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{item.title}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {formatStatusLabel(item.status)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
