import { State } from '@hateoas-ts/resource';
import {
  AcpEventEnvelope,
  AcpSession,
  Role,
  Specialist,
  Task,
} from '@shared/schema';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui';
import {
  ActivityIcon,
  BookTextIcon,
  Clock3Icon,
  CpuIcon,
  ListChecksIcon,
  RadioTowerIcon,
  Settings2Icon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  eventHeadline,
  eventIcon,
  eventLabel,
  formatDateTime,
  formatStatusLabel,
  formatTaskKindLabel,
  renderEventDetails,
  sessionDisplayName,
  statusChipClasses,
  statusTone,
  TaskSnapshotItem,
  WorkbenchProjectInsights,
} from './project-session-workbench.shared';

export function ProjectSessionStatusSidebar(props: {
  contextSummary: WorkbenchProjectInsights;
  events: AcpEventEnvelope[];
  onOpenTask: (task: State<Task>) => void | Promise<void>;
  roleById: Map<string, State<Role>>;
  selectedSession: State<AcpSession> | null;
  selectedTask: State<Task> | null;
  specialistById: Map<string, State<Specialist>>;
  taskSnapshotItems: TaskSnapshotItem[];
}) {
  const {
    contextSummary,
    events,
    onOpenTask,
    roleById,
    selectedSession,
    selectedTask,
    specialistById,
    taskSnapshotItems,
  } = props;
  const recentEvents = events.slice(-10).reverse();
  const assignedRole = selectedTask?.data.assignedRole
    ? (roleById.get(selectedTask.data.assignedRole)?.data.name ??
      selectedTask.data.assignedRole)
    : '未分配';
  const assignedSpecialist = selectedTask?.data.assignedSpecialistId
    ? (specialistById.get(selectedTask.data.assignedSpecialistId)?.data.name ??
      selectedTask.data.assignedSpecialistName ??
      selectedTask.data.assignedSpecialistId)
    : (selectedTask?.data.assignedSpecialistName ?? '角色默认');
  const actionLabel =
    selectedTask?.data.executionSessionId != null
      ? '打开执行'
      : selectedTask?.data.kind === 'review' ||
          selectedTask?.data.assignedRole === 'GATE'
        ? '开始复核'
        : '开始执行';
  const defaultTab = selectedTask
    ? 'overview'
    : taskSnapshotItems.length > 0
      ? 'tasks'
      : 'activity';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background/95">
      <div className="border-b px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Control Plane
            </p>
            <p className="mt-1 text-sm font-semibold">
              {selectedTask
                ? '任务编排'
                : taskSnapshotItems.length > 0
                  ? '执行面板'
                  : '会话控制台'}
            </p>
          </div>
          <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
            {formatStatusLabel(selectedSession?.data.state)}
          </span>
        </div>
      </div>

      <Tabs defaultValue={defaultTab} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b px-4 py-3">
          <TabsList className="grid h-10 w-full grid-cols-3 rounded-xl bg-muted/70">
            <TabsTrigger value="overview" className="rounded-lg text-xs">
              Overview
            </TabsTrigger>
            <TabsTrigger value="tasks" className="rounded-lg text-xs">
              Tasks
            </TabsTrigger>
            <TabsTrigger value="activity" className="rounded-lg text-xs">
              Activity
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3">
                <InsightTile
                  icon={<BookTextIcon className="size-4" />}
                  label="Project Notes"
                  value={String(contextSummary.noteCount)}
                  meta={`当前会话 ${contextSummary.sessionNoteCount}`}
                />
                <InsightTile
                  icon={<RadioTowerIcon className="size-4" />}
                  label="Task Runs"
                  value={String(contextSummary.taskRunCount)}
                  meta={`当前会话 ${contextSummary.sessionTaskRunCount}`}
                />
                <InsightTile
                  icon={<CpuIcon className="size-4" />}
                  label="Provider"
                  value={
                    contextSummary.runtimeProfile?.defaultProviderId ??
                    selectedSession?.data.provider ??
                    '未设置'
                  }
                />
                <InsightTile
                  icon={<Settings2Icon className="size-4" />}
                  label="Mode"
                  value={
                    contextSummary.runtimeProfile?.orchestrationMode ?? 'ROUTA'
                  }
                  meta={contextSummary.loading ? '同步中…' : 'Project profile'}
                />
              </div>

              <Card className="rounded-3xl border-border/70 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Clock3Icon className="size-4 text-muted-foreground" />
                    Session Snapshot
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <MetadataRow
                    label="标题"
                    value={
                      selectedSession
                        ? sessionDisplayName(selectedSession)
                        : '未选择会话'
                    }
                  />
                  <MetadataRow
                    label="Provider"
                    value={selectedSession?.data.provider ?? '未设置'}
                  />
                  <MetadataRow
                    label="Specialist"
                    value={selectedSession?.data.specialistId ?? '默认'}
                  />
                  <MetadataRow
                    label="最近活跃"
                    value={
                      selectedSession?.data.lastActivityAt
                        ? formatDateTime(selectedSession.data.lastActivityAt)
                        : '无'
                    }
                  />
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-border/70 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Settings2Icon className="size-4 text-muted-foreground" />
                    Runtime Profile
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <MetadataRow
                    label="Default Provider"
                    value={
                      contextSummary.runtimeProfile?.defaultProviderId ??
                      '未设置'
                    }
                  />
                  <MetadataRow
                    label="Default Model"
                    value={
                      contextSummary.runtimeProfile?.defaultModel ?? '未设置'
                    }
                  />
                  <MetadataRow
                    label="Orchestration"
                    value={
                      contextSummary.runtimeProfile?.orchestrationMode ??
                      'ROUTA'
                    }
                  />
                  <MetadataRow
                    label="Skills"
                    value={String(
                      contextSummary.runtimeProfile?.enabledSkillIds.length ??
                        0,
                    )}
                  />
                  <MetadataRow
                    label="MCP Servers"
                    value={String(
                      contextSummary.runtimeProfile?.enabledMcpServerIds
                        .length ?? 0,
                    )}
                  />
                </CardContent>
              </Card>

              {selectedTask ? (
                <Card className="rounded-3xl border-border/70 shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <ListChecksIcon className="size-4 text-muted-foreground" />
                      当前任务
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {selectedTask.data.title}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {selectedTask.data.objective}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${statusChipClasses(selectedTask.data.status)}`}
                      >
                        {formatStatusLabel(selectedTask.data.status)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <MetadataRow
                        label="类型"
                        value={formatTaskKindLabel(selectedTask.data.kind)}
                      />
                      <MetadataRow label="角色" value={assignedRole} />
                      <MetadataRow
                        label="Specialist"
                        value={assignedSpecialist}
                      />
                      <MetadataRow
                        label="依赖"
                        value={String(selectedTask.data.dependencies.length)}
                      />
                    </div>

                    {selectedTask.data.scope ? (
                      <TaskListCard
                        title="Scope"
                        items={[selectedTask.data.scope]}
                      />
                    ) : null}
                    {selectedTask.data.acceptanceCriteria.length > 0 ? (
                      <TaskListCard
                        title="验收标准"
                        items={selectedTask.data.acceptanceCriteria}
                      />
                    ) : null}
                    {selectedTask.data.verificationCommands.length > 0 ? (
                      <TaskListCard
                        title="验证命令"
                        items={selectedTask.data.verificationCommands}
                      />
                    ) : null}
                    {selectedTask.data.completionSummary ? (
                      <TaskListCard
                        title="完成总结"
                        items={[selectedTask.data.completionSummary]}
                      />
                    ) : null}

                    <Button
                      size="sm"
                      onClick={() => void onOpenTask(selectedTask)}
                    >
                      {actionLabel}
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="tasks" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-4 p-4">
              {taskSnapshotItems.length === 0 ? (
                <EmptyPanel
                  icon={
                    <ListChecksIcon className="size-4 text-muted-foreground" />
                  }
                  title="还没有任务快照"
                  description="当会话产生 plan 或 tool 调用时，这里会出现 Routa 风格的任务面板。"
                />
              ) : (
                taskSnapshotItems.map((item) => (
                  <Card
                    key={item.id}
                    className="rounded-3xl border-border/70 shadow-none"
                  >
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`size-2 shrink-0 rounded-full ${statusTone(item.status)}`}
                            />
                            <div className="truncate text-sm font-semibold">
                              {item.title}
                            </div>
                          </div>
                          {item.description ? (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {item.description}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${statusChipClasses(item.status)}`}
                        >
                          {formatStatusLabel(item.status)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="activity" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-4 p-4">
              {recentEvents.length === 0 ? (
                <EmptyPanel
                  icon={
                    <ActivityIcon className="size-4 text-muted-foreground" />
                  }
                  title="还没有运行记录"
                  description="当会话进入工具调用、状态切换或消息流时，这里会显示最近活动。"
                />
              ) : (
                recentEvents.map((event) => (
                  <Card
                    key={event.eventId}
                    className="rounded-3xl border-border/70 shadow-none"
                  >
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {event.type === 'tool_call' ||
                          event.type === 'tool_result'
                            ? eventIcon.tool
                            : eventIcon.default}
                          <div>
                            <div className="text-sm font-semibold">
                              {eventLabel(event)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {eventHeadline(event)}
                            </div>
                          </div>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatDateTime(event.emittedAt)}
                        </div>
                      </div>
                      {renderEventDetails(event)}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetadataRow(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[220px] text-right font-medium">{value}</span>
    </div>
  );
}

function InsightTile(props: {
  icon: ReactNode;
  label: string;
  meta?: string;
  value: string;
}) {
  const { icon, label, meta, value } = props;

  return (
    <Card className="rounded-3xl border-border/70 shadow-none">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
            {label}
          </span>
        </div>
        <div className="text-lg font-semibold">{value}</div>
        {meta ? (
          <div className="text-xs text-muted-foreground">{meta}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EmptyPanel(props: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  const { description, icon, title } = props;

  return (
    <Card className="rounded-3xl border-border/70 border-dashed shadow-none">
      <CardContent className="flex flex-col items-start gap-3 p-4">
        <div className="flex size-9 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          {icon}
        </div>
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskListCard(props: { items: string[]; title: string }) {
  const { items, title } = props;

  return (
    <div className="rounded-3xl border bg-muted/10 p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </div>
      <div className="mt-2 space-y-2 text-sm">
        {items.map((item, index) => (
          <div
            key={`${title}-${index}`}
            className="rounded-2xl bg-background px-3 py-2"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
