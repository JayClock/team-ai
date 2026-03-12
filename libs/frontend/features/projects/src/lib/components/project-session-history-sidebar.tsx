import { State } from '@hateoas-ts/resource';
import { AcpSessionSummary, Role, Specialist, Task } from '@shared/schema';
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
  Input,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
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
import { type RefObject, useEffect, useMemo, useState } from 'react';
import {
  countSessionTree,
  formatDateTime,
  formatStatusLabel,
  formatTaskKindLabel,
  SessionTreeNode,
  sessionDisplayName,
  SidebarTab,
  statusChipClasses,
  statusTone,
} from './project-session-workbench.shared';

type TaskDraftInput = {
  acceptanceCriteria: string;
  assignedRole: string;
  assignedSpecialistId: string;
  dependencies: string;
  kind: string;
  objective: string;
  parentTaskId: string;
  scope: string;
  title: string;
  verificationCommands: string;
};

const emptyTaskDraft: TaskDraftInput = {
  acceptanceCriteria: '',
  assignedRole: 'CRAFTER',
  assignedSpecialistId: '',
  dependencies: '',
  kind: 'implement',
  objective: '',
  parentTaskId: '',
  scope: '',
  title: '',
  verificationCommands: '',
};

export function ProjectSessionHistorySidebar(props: {
  activeTab: SidebarTab;
  leftSidebarRatio: number;
  onCollapse: () => void;
  onCreateTask: (input: TaskDraftInput) => void | Promise<void>;
  onDeleteSession: (session: State<AcpSessionSummary>) => void;
  onOpenRename: (session: State<AcpSessionSummary>) => void;
  onOpenTask: (task: State<Task>) => void | Promise<void>;
  onSelectSession: (session: State<AcpSessionSummary>) => void;
  onSelectTask: (taskId: string) => void;
  onStartSplitResize: () => void;
  onTabChange: (value: SidebarTab) => void;
  projectTitle: string;
  quickAccessVisible: boolean;
  roles: State<Role>[];
  selectedSessionId?: string;
  selectedTaskId?: string | null;
  sessions: SessionTreeNode[];
  sessionsLoading: boolean;
  sessionsSplitRef: RefObject<HTMLDivElement | null>;
  specialists: State<Specialist>[];
  taskContextSession: State<AcpSessionSummary> | null;
  tasks: State<Task>[];
  tasksLoading: boolean;
}) {
  const {
    activeTab,
    leftSidebarRatio,
    onCollapse,
    onCreateTask,
    onDeleteSession,
    onOpenRename,
    onOpenTask,
    onSelectSession,
    onSelectTask,
    onStartSplitResize,
    onTabChange,
    projectTitle,
    quickAccessVisible,
    roles,
    selectedSessionId,
    selectedTaskId,
    sessions,
    sessionsLoading,
    sessionsSplitRef,
    specialists,
    taskContextSession,
    tasks,
    tasksLoading,
  } = props;
  const totalSessions = useMemo(
    () => sessions.reduce((count, node) => count + countSessionTree(node), 0),
    [sessions],
  );
  const runningCount = tasks.filter((item) =>
    ['RUNNING', 'running', 'in_progress'].includes(item.data.status),
  ).length;

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
              {tasks.length > 0 ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    runningCount > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {tasks.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="sessions"
          className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="border-b px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              会话
            </p>
            <p className="mt-1 text-sm font-medium">
              共 {totalSessions} 个会话
            </p>
          </div>

          <div
            ref={sessionsSplitRef}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div
              className="min-h-0 overflow-hidden"
              style={
                quickAccessVisible
                  ? { flexBasis: `${leftSidebarRatio * 100}%` }
                  : undefined
              }
            >
              <ScrollArea className="h-full">
                <div className="space-y-2 p-3">
                  {sessionsLoading ? (
                    <p className="text-sm text-muted-foreground">
                      正在加载会话...
                    </p>
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
                    tasks={tasks}
                    onOpenTasks={() => onTabChange('tasks')}
                  />
                </div>
              </>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent
          value="spec"
          className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <SpecSidebarContent
            roles={roles}
            specialists={specialists}
            taskContextSession={taskContextSession}
            tasks={tasks}
            onCreateTask={onCreateTask}
            onOpenTasks={() => onTabChange('tasks')}
          />
        </TabsContent>

        <TabsContent
          value="tasks"
          className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <TasksSidebarContent
            selectedTaskId={selectedTaskId}
            tasks={tasks}
            tasksLoading={tasksLoading}
            onOpenTask={onOpenTask}
            onSelectTask={onSelectTask}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SpecSidebarContent(props: {
  roles: State<Role>[];
  specialists: State<Specialist>[];
  taskContextSession: State<AcpSessionSummary> | null;
  tasks: State<Task>[];
  onCreateTask: (input: TaskDraftInput) => void | Promise<void>;
  onOpenTasks: () => void;
}) {
  const {
    roles,
    specialists,
    taskContextSession,
    tasks,
    onCreateTask,
    onOpenTasks,
  } = props;
  const [draft, setDraft] = useState<TaskDraftInput>(emptyTaskDraft);

  useEffect(() => {
    if (draft.kind === 'review' && draft.assignedRole !== 'GATE') {
      setDraft((current) => ({
        ...current,
        assignedRole: 'GATE',
      }));
      return;
    }

    if (draft.kind === 'plan' && draft.assignedRole !== 'ROUTA') {
      setDraft((current) => ({
        ...current,
        assignedRole: 'ROUTA',
      }));
      return;
    }

    if (
      draft.kind !== 'review' &&
      draft.kind !== 'plan' &&
      (!draft.assignedRole ||
        draft.assignedRole === 'GATE' ||
        draft.assignedRole === 'ROUTA')
    ) {
      setDraft((current) => ({
        ...current,
        assignedRole: 'CRAFTER',
      }));
    }
  }, [draft.assignedRole, draft.kind]);

  const filteredSpecialists = useMemo(
    () =>
      specialists.filter(
        (specialist) =>
          !draft.assignedRole || specialist.data.role === draft.assignedRole,
      ),
    [draft.assignedRole, specialists],
  );

  const submit = async () => {
    await onCreateTask(draft);
    setDraft((current) => ({
      ...emptyTaskDraft,
      assignedRole: current.assignedRole,
      kind: current.kind,
    }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          规格
        </p>
        <p className="mt-1 text-sm font-medium">
          {taskContextSession ? '拆解任务并分配角色' : '请选择一个会话开始拆解'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {taskContextSession
            ? `当前上下文：${sessionDisplayName(taskContextSession)}`
            : '需要先选择一个协调会话，才能把拆解结果写入持久化任务。'}
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3">
          <div className="rounded-2xl border bg-background p-3">
            <div className="space-y-3">
              <Input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="任务标题"
                disabled={!taskContextSession}
              />
              <Textarea
                value={draft.objective}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    objective: event.target.value,
                  }))
                }
                placeholder="任务目标"
                disabled={!taskContextSession}
                className="min-h-24"
              />
              <Textarea
                value={draft.scope}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    scope: event.target.value,
                  }))
                }
                placeholder="范围说明（可选）"
                disabled={!taskContextSession}
                className="min-h-20"
              />

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <select
                  value={draft.kind}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      kind: event.target.value,
                    }))
                  }
                  disabled={!taskContextSession}
                  className="h-10 rounded-xl border bg-background px-3 text-sm"
                >
                  <option value="implement">实现任务</option>
                  <option value="review">复核任务</option>
                  <option value="verify">验证任务</option>
                  <option value="plan">规划任务</option>
                </select>

                <select
                  value={draft.assignedRole}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      assignedRole: event.target.value,
                      assignedSpecialistId: '',
                    }))
                  }
                  disabled={!taskContextSession}
                  className="h-10 rounded-xl border bg-background px-3 text-sm"
                >
                  {roles.map((role) => (
                    <option key={role.data.id} value={role.data.id}>
                      {role.data.name}
                    </option>
                  ))}
                </select>
              </div>

              <select
                value={draft.assignedSpecialistId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    assignedSpecialistId: event.target.value,
                  }))
                }
                disabled={!taskContextSession}
                className="h-10 rounded-xl border bg-background px-3 text-sm"
              >
                <option value="">使用角色默认 specialist</option>
                {filteredSpecialists.map((specialist) => (
                  <option key={specialist.data.id} value={specialist.data.id}>
                    {specialist.data.name}
                  </option>
                ))}
              </select>

              <select
                value={draft.parentTaskId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parentTaskId: event.target.value,
                  }))
                }
                disabled={!taskContextSession}
                className="h-10 rounded-xl border bg-background px-3 text-sm"
              >
                <option value="">无父任务</option>
                {tasks.map((task) => (
                  <option key={task.data.id} value={task.data.id}>
                    {task.data.title}
                  </option>
                ))}
              </select>

              <Textarea
                value={draft.acceptanceCriteria}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    acceptanceCriteria: event.target.value,
                  }))
                }
                placeholder="验收标准，每行一条"
                disabled={!taskContextSession}
                className="min-h-24"
              />
              <Textarea
                value={draft.verificationCommands}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    verificationCommands: event.target.value,
                  }))
                }
                placeholder="验证命令，每行一条"
                disabled={!taskContextSession}
                className="min-h-24"
              />
              <Textarea
                value={draft.dependencies}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    dependencies: event.target.value,
                  }))
                }
                placeholder="依赖任务 ID，每行一条"
                disabled={!taskContextSession}
                className="min-h-20"
              />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button
                onClick={() => void submit()}
                disabled={!taskContextSession}
              >
                写入任务
              </Button>
              <Button variant="outline" onClick={onOpenTasks}>
                查看任务
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function TasksSidebarContent(props: {
  selectedTaskId?: string | null;
  tasks: State<Task>[];
  tasksLoading: boolean;
  onOpenTask: (task: State<Task>) => void | Promise<void>;
  onSelectTask: (taskId: string) => void;
}) {
  const { selectedTaskId, tasks, tasksLoading, onOpenTask, onSelectTask } =
    props;
  const runningCount = tasks.filter((task) =>
    ['RUNNING', 'running', 'in_progress'].includes(task.data.status),
  ).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          任务
        </p>
        <p className="mt-1 text-sm font-medium">
          {tasks.length > 0
            ? `共 ${tasks.length} 项，${runningCount} 项进行中`
            : '暂无任务'}
        </p>
      </div>

      <ScrollArea className="h-full">
        <div className="space-y-2 p-3">
          {tasksLoading ? (
            <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              正在加载任务...
            </div>
          ) : tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              还没有持久化任务。
            </div>
          ) : (
            tasks.map((task) => {
              const active = selectedTaskId === task.data.id;
              const actionLabel =
                task.data.executionSessionId != null
                  ? '打开'
                  : task.data.kind === 'review' ||
                      task.data.assignedRole === 'GATE'
                    ? '复核'
                    : '执行';

              return (
                <div
                  key={task.data.id}
                  className={`rounded-2xl border px-3 py-3 transition ${
                    active
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'bg-background'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onSelectTask(task.data.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-2 shrink-0 rounded-full ${statusTone(task.data.status)}`}
                        />
                        <span className="truncate text-sm font-medium">
                          {task.data.title}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span>{formatTaskKindLabel(task.data.kind)}</span>
                        <span>
                          {task.data.assignedSpecialistName ??
                            task.data.assignedRole ??
                            '未分配角色'}
                        </span>
                        {task.data.dependencies.length > 0 ? (
                          <span>依赖 {task.data.dependencies.length}</span>
                        ) : null}
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${statusChipClasses(task.data.status)}`}
                      >
                        {formatStatusLabel(task.data.status)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                          void onOpenTask(task);
                        }}
                      >
                        {actionLabel}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
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
          active
            ? 'border-primary bg-primary/5 shadow-sm'
            : 'border-border bg-background'
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
              {node.session.data.task?.id ? (
                <span>任务 {node.session.data.task.id}</span>
              ) : null}
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
  tasks: State<Task>[];
  onOpenTasks: () => void;
}) {
  const { tasks, onOpenTasks } = props;
  const runningCount = tasks.filter((task) =>
    ['RUNNING', 'running', 'in_progress'].includes(task.data.status),
  ).length;
  const completedCount = tasks.filter((task) =>
    ['COMPLETED', 'completed'].includes(task.data.status),
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
              {`${tasks.length} 个持久化任务${runningCount > 0 ? `，${runningCount} 个进行中` : ''}`}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={onOpenTasks}
          >
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
              共 {tasks.length} 项
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
          <div
            className="space-y-2 px-3 pb-3"
            data-testid="session-task-snapshot"
          >
            {tasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                还没有持久化任务。
              </div>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.data.id}
                  data-testid="session-task-snapshot-item"
                  className="flex items-center gap-3 rounded-2xl border bg-background px-3 py-3"
                >
                  <span
                    className={`size-2 shrink-0 rounded-full ${statusTone(task.data.status)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {task.data.title}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {formatStatusLabel(task.data.status)}
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
