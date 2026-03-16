import { State } from '@hateoas-ts/resource';
import { AcpEventEnvelope, AcpSession } from '@shared/schema';
import {
  Button,
  Card,
  CardContent,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui';
import { ActivityIcon, ArrowUpRightIcon, ListChecksIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  buildWorkbenchWalkthroughScenarios,
  canRetryTask,
  describeTaskExecutionStatus,
  eventHeadline,
  eventIcon,
  eventLabel,
  formatDateTime,
  formatOrchestrationModeLabel,
  formatStatusLabel,
  formatTaskWorkflowColumnLabel,
  formatTaskSourceLabel,
  formatTaskKindLabel,
  formatVerificationVerdictLabel,
  formatWalkthroughStatusLabel,
  getTaskPrimaryAction,
  renderEventDetails,
  sessionDisplayName,
  statusChipClasses,
  statusTone,
  type TaskPanelAction,
  type TaskPanelItem,
  type TaskRunPanelItem,
  type WorkbenchWalkthroughScenario,
  verificationVerdictChipClasses,
  walkthroughStatusChipClasses,
} from './project-session-workbench.shared';
import type { WorkbenchSessionRuntimeProfile } from './session-runtime-profile';

export function ProjectSessionStatusSidebar(props: {
  activeTab?: 'activity' | 'checklist' | 'tasks';
  events: AcpEventEnvelope[];
  onOpenSession: (sessionId: string) => void;
  onTabChange?: (tab: 'activity' | 'checklist' | 'tasks') => void;
  onTaskAction: (item: TaskPanelItem, action: TaskPanelAction) => void;
  pendingTaskAction: {
    action: TaskPanelAction;
    taskId: string;
  } | null;
  providerFallbackLabel: string;
  runtimeProfile?: WorkbenchSessionRuntimeProfile | null;
  selectedSession: State<AcpSession> | null;
  streamStatus: string;
  taskItems: TaskPanelItem[];
  tasksLoading: boolean;
}) {
  const {
    activeTab,
    events,
    onOpenSession,
    onTabChange,
    onTaskAction,
    pendingTaskAction,
    providerFallbackLabel,
    runtimeProfile,
    selectedSession,
    streamStatus,
    taskItems,
    tasksLoading,
  } = props;
  const recentEvents = events.slice(-12).reverse();
  const defaultTab =
    taskItems.length > 0 || tasksLoading
      ? 'tasks'
      : recentEvents.length > 0
        ? 'activity'
        : 'checklist';
  const walkthroughScenarios = buildWorkbenchWalkthroughScenarios({
    events,
    runtimeProfile,
    selectedSession,
    streamStatus,
    taskItems,
  });
  const walkthroughTaskCount = taskItems.filter(
    (item) => item.source === 'task',
  ).length;
  const walkthroughRunCount = taskItems.reduce(
    (count, item) => count + (item.taskRuns?.length ?? 0),
    0,
  );
  const walkthroughCoveredCount = walkthroughScenarios.filter(
    (scenario) => scenario.status === 'covered',
  ).length;
  const runtimeModeLabel = runtimeProfile
    ? formatOrchestrationModeLabel(runtimeProfile.orchestrationMode)
    : '未加载模式';
  const defaultProviderLabel =
    runtimeProfile?.defaultProviderId?.trim() || '未配置默认 provider';
  const resolvedTab = activeTab ?? defaultTab;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Session Panel
            </p>
            <p className="mt-1 truncate text-sm font-semibold">
              {selectedSession
                ? sessionDisplayName(selectedSession)
                : '会话面板'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedSession?.data.provider ?? providerFallbackLabel}
              {selectedSession?.data.lastActivityAt
                ? ` · ${formatDateTime(selectedSession.data.lastActivityAt)}`
                : ''}
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${statusChipClasses(streamStatus)}`}
          >
            <span
              className={`size-1.5 rounded-full ${statusTone(streamStatus)}`}
            />
            {formatStatusLabel(streamStatus)}
          </span>
        </div>
      </div>

      <Tabs
        value={resolvedTab}
        onValueChange={(value) =>
          onTabChange?.(value as 'activity' | 'checklist' | 'tasks')
        }
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-border/60 px-3 py-2">
          <TabsList className="grid h-9 w-full grid-cols-3 rounded-lg bg-muted/70">
            <TabsTrigger value="tasks" className="rounded-md text-xs">
              Tasks
            </TabsTrigger>
            <TabsTrigger value="activity" className="rounded-md text-xs">
              Activity
            </TabsTrigger>
            <TabsTrigger value="checklist" className="rounded-md text-xs">
              Checklist
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="tasks" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-3 p-4">
              {tasksLoading && taskItems.length === 0 ? (
                <EmptyPanel
                  icon={
                    <ListChecksIcon className="size-4 text-muted-foreground" />
                  }
                  title="正在同步任务"
                  description="正在拉取当前会话的任务与执行会话关系。"
                />
              ) : taskItems.length === 0 ? (
                <EmptyPanel
                  icon={
                    <ListChecksIcon className="size-4 text-muted-foreground" />
                  }
                  title="还没有任务快照"
                  description="当会话产生 plan、任务或工具调用时，这里会显示任务概览与执行链路。"
                />
              ) : (
                <>
                  <WorkflowSummaryCard taskItems={taskItems} />
                  {taskItems.map((item) => (
                    <Card
                      key={item.id}
                      className="rounded-xl border-border/70 shadow-none"
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
                            {item.source === 'task' ? (
                              <TaskExecutionDetails
                                currentSessionId={selectedSession?.data.id}
                                item={item}
                                onOpenSession={onOpenSession}
                                onTaskAction={onTaskAction}
                                pendingTaskAction={pendingTaskAction}
                              />
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
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="activity" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-3 p-4">
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
                    className="rounded-xl border-border/70 shadow-none"
                  >
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          {(event.update.eventType === 'tool_call' ||
                            event.update.eventType === 'tool_call_update')
                            ? eventIcon.tool
                            : eventIcon.default}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">
                              {eventLabel(event)}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {eventHeadline(event)}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-[11px] text-muted-foreground">
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

        <TabsContent value="checklist" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-3 p-4">
              <Card className="rounded-xl border-border/70 shadow-none">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">
                        演示脚本与验收场景
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        按下面 4 个场景逐项演示，就能稳定讲清桌面多 agent
                        编排、失败恢复、单人模式与 provider 切换。
                      </p>
                    </div>
                    <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                      {walkthroughCoveredCount}/{walkthroughScenarios.length}{' '}
                      已覆盖
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                      {selectedSession
                        ? sessionDisplayName(selectedSession)
                        : '未选择会话'}
                    </span>
                    <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                      {walkthroughTaskCount} 个 task
                    </span>
                    <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                      {walkthroughRunCount} 条 run
                    </span>
                    <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                      provider{' '}
                      {selectedSession?.data.provider ?? providerFallbackLabel}
                    </span>
                    <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                      模式 {runtimeModeLabel}
                    </span>
                    <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                      默认 provider {defaultProviderLabel}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {walkthroughScenarios.map((scenario, index) => (
                <ChecklistScenarioCard
                  key={scenario.id}
                  index={index}
                  scenario={scenario}
                />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WorkflowSummaryCard(props: { taskItems: TaskPanelItem[] }) {
  const { taskItems } = props;
  const laneCounts = new Map<string, number>();

  for (const item of taskItems) {
    const lane = formatTaskWorkflowColumnLabel(item.columnId);
    laneCounts.set(lane, (laneCounts.get(lane) ?? 0) + 1);
  }

  const lanes = [...laneCounts.entries()].sort((left, right) =>
    left[0].localeCompare(right[0], 'en'),
  );

  return (
    <Card className="rounded-xl border-border/70 shadow-none">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
            <div>
            <div className="text-sm font-semibold">Workflow Board</div>
            <p className="mt-1 text-sm text-muted-foreground">
              当前任务按 workflow lane 归位，直接对应 spec -&gt; task -&gt;
              child session 的执行流。
            </p>
          </div>
          <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
            {taskItems.length} 张卡片
          </span>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          {lanes.map(([lane, count]) => (
            <span
              key={lane}
              className="rounded-full border border-border/60 bg-background px-2 py-1"
            >
              {lane} · {count}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ChecklistScenarioCard(props: {
  index: number;
  scenario: WorkbenchWalkthroughScenario;
}) {
  const { index, scenario } = props;

  return (
    <Card className="rounded-xl border-border/70 shadow-none">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                场景 {index + 1}
              </span>
              <div className="text-sm font-semibold">{scenario.title}</div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {scenario.summary}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${walkthroughStatusChipClasses(scenario.status)}`}
          >
            {formatWalkthroughStatusLabel(scenario.status)}
          </span>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            当前观察
          </div>
          <p className="mt-1 text-sm leading-6">{scenario.liveNote}</p>
        </div>

        <ChecklistStepsBlock label="走查步骤" steps={scenario.steps} />
        <ChecklistStepsBlock
          label="预期信号"
          steps={scenario.expectedSignals}
        />
      </CardContent>
    </Card>
  );
}

function ChecklistStepsBlock(props: { label: string; steps: string[] }) {
  const { label, steps } = props;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((step, index) => (
          <li key={`${label}-${index}`} className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-[11px] font-medium text-muted-foreground">
              {index + 1}
            </span>
            <span className="text-sm leading-6">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TaskExecutionDetails(props: {
  currentSessionId?: string;
  item: TaskPanelItem;
  onOpenSession: (sessionId: string) => void;
  onTaskAction: (item: TaskPanelItem, action: TaskPanelAction) => void;
  pendingTaskAction: {
    action: TaskPanelAction;
    taskId: string;
  } | null;
}) {
  const {
    currentSessionId,
    item,
    onOpenSession,
    onTaskAction,
    pendingTaskAction,
  } = props;
  const executionStatus = describeTaskExecutionStatus(item, currentSessionId);

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {item.kind ? (
          <span className="rounded-full border border-border/60 bg-background px-2 py-1">
            {formatTaskKindLabel(item.kind)}
          </span>
        ) : null}
        {item.assignedRole ? (
          <span className="rounded-full border border-border/60 bg-background px-2 py-1 font-mono">
            {item.assignedRole}
          </span>
        ) : null}
        {item.assignedSpecialistName ? (
          <span className="rounded-full border border-border/60 bg-background px-2 py-1">
            {item.assignedSpecialistName}
          </span>
        ) : null}
        {item.assignedSpecialistId ? (
          <span className="rounded-full border border-border/60 bg-background px-2 py-1 font-mono">
            {item.assignedSpecialistId}
          </span>
        ) : null}
        {item.assignedProvider ? (
          <span className="rounded-full border border-border/60 bg-background px-2 py-1 font-mono">
            {item.assignedProvider}
          </span>
        ) : null}
        {item.boardId ? (
          <span className="rounded-full border border-border/60 bg-background px-2 py-1 font-mono">
            board {item.boardId}
          </span>
        ) : null}
        {item.columnId ? (
          <span className="rounded-full border border-border/60 bg-background px-2 py-1">
            lane {formatTaskWorkflowColumnLabel(item.columnId)}
          </span>
        ) : null}
        {item.codebaseId ? (
          <span className="rounded-full border border-border/60 bg-background px-2 py-1 font-mono">
            {item.codebaseId}
          </span>
        ) : null}
        {item.worktreeId ? (
          <span className="rounded-full border border-border/60 bg-background px-2 py-1 font-mono">
            {item.worktreeId}
          </span>
        ) : null}
        {item.sourceType ? (
          <span className="rounded-full border border-border/60 bg-background px-2 py-1">
            来源 {formatTaskSourceLabel(item.sourceType)}
          </span>
        ) : null}
      </div>

      {executionStatus ? (
        <TaskMetaBlock label="当前执行状态" value={executionStatus} />
      ) : null}

      {item.sourceType ? (
        <TaskSourceBlock
          sourceEntryIndex={item.sourceEntryIndex ?? null}
          sourceEventId={item.sourceEventId ?? null}
          sourceType={item.sourceType}
        />
      ) : null}

      <TaskRunTimelineCard
        currentSessionId={currentSessionId}
        onOpenSession={onOpenSession}
        runs={item.taskRuns ?? []}
      />

      <TaskSessionLinkCard
        actionLabel="打开执行会话"
        currentSessionId={currentSessionId}
        label="executionSessionId"
        onOpenSession={onOpenSession}
        sessionId={item.executionSessionId ?? null}
      />
      <TaskSessionLinkCard
        actionLabel="打开结果会话"
        currentSessionId={currentSessionId}
        label="resultSessionId"
        onOpenSession={onOpenSession}
        sessionId={item.resultSessionId ?? null}
      />
      <TaskActionCard
        item={item}
        onTaskAction={onTaskAction}
        pendingTaskAction={pendingTaskAction}
      />
    </div>
  );
}

function TaskSourceBlock(props: {
  sourceEntryIndex: number | null;
  sourceEventId: string | null;
  sourceType: string;
}) {
  const { sourceEntryIndex, sourceEventId, sourceType } = props;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        任务来源
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full border border-border/60 bg-background px-2 py-1">
          {formatTaskSourceLabel(sourceType)}
        </span>
        {sourceEntryIndex !== null ? (
          <span className="rounded-full border border-border/60 bg-background px-2 py-1">
            block #{sourceEntryIndex + 1}
          </span>
        ) : null}
        {sourceEventId ? (
          <span className="rounded-full border border-border/60 bg-background px-2 py-1 font-mono">
            {sourceEventId}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TaskRunTimelineCard(props: {
  currentSessionId?: string;
  onOpenSession: (sessionId: string) => void;
  runs: TaskRunPanelItem[];
}) {
  const { currentSessionId, onOpenSession, runs } = props;

  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Task Runs
            </div>
            <div className="mt-1 text-sm font-medium">暂无执行记录</div>
          </div>
          <span className="rounded-full border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground">
            0 次执行
          </span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          task
          首次被自动分发或手动执行后，这里会展示执行时间线、结果摘要与验证结论。
        </p>
      </div>
    );
  }

  const latestRun = runs.find((run) => run.isLatest) ?? runs[0];
  const historicalRuns = runs.filter((run) => run.id !== latestRun.id);

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Task Runs
          </div>
          <div className="mt-1 text-sm font-medium">执行时间线与结果</div>
        </div>
        <span className="rounded-full border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground">
          {runs.length} 次执行
        </span>
      </div>

      <div className="mt-3 space-y-3">
        <TaskRunTimelineItem
          currentSessionId={currentSessionId}
          onOpenSession={onOpenSession}
          run={latestRun}
          showConnector={historicalRuns.length > 0}
          title="最新执行"
        />

        {historicalRuns.length > 0 ? (
          <details className="rounded-xl border border-border/60 bg-background/80 p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">历史执行</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  共 {historicalRuns.length} 次历史记录
                </div>
              </div>
              <span className="text-xs text-muted-foreground">展开查看</span>
            </summary>
            <div className="mt-3 space-y-3">
              {historicalRuns.map((run, index) => (
                <TaskRunTimelineItem
                  key={run.id}
                  currentSessionId={currentSessionId}
                  onOpenSession={onOpenSession}
                  run={run}
                  showConnector={index < historicalRuns.length - 1}
                  title={`历史执行 ${historicalRuns.length - index}`}
                />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function TaskRunTimelineItem(props: {
  currentSessionId?: string;
  onOpenSession: (sessionId: string) => void;
  run: TaskRunPanelItem;
  showConnector: boolean;
  title: string;
}) {
  const { currentSessionId, onOpenSession, run, showConnector, title } = props;
  const lifecycle = buildTaskRunLifecycle(run);
  const runSessionId = run.sessionId;
  const isCurrentSession = Boolean(
    runSessionId && runSessionId === currentSessionId,
  );

  return (
    <div className="relative pl-5">
      {showConnector ? (
        <span className="absolute bottom-[-12px] left-[5px] top-3 w-px bg-border/70" />
      ) : null}
      <span
        className={`absolute left-0 top-2.5 size-2.5 rounded-full ${statusTone(run.status)}`}
      />

      <div className="rounded-xl border border-border/60 bg-background p-3 shadow-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold">{title}</div>
              {run.isLatest ? (
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                  最新
                </span>
              ) : null}
            </div>
            <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
              {run.id}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${statusChipClasses(run.status)}`}
          >
            {formatStatusLabel(run.status)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-1">
            {formatTaskKindLabel(run.kind)}
          </span>
          {run.role ? (
            <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-1 font-mono">
              {run.role}
            </span>
          ) : null}
          {run.provider ? (
            <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-1 font-mono">
              {run.provider}
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid gap-2">
          {lifecycle.map((entry) => (
            <div
              key={`${run.id}-${entry.label}`}
              className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {entry.label}
              </div>
              <div className="mt-1 text-xs text-foreground">
                {formatDateTime(entry.value)}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-3">
          <TaskRunTextBlock
            label="结果摘要"
            value={run.summary}
            emptyLabel="暂无摘要"
          />
          <TaskRunVerdictBlock verdict={run.verificationVerdict} />
          <TaskRunTextBlock
            label="验证报告"
            value={run.verificationReport}
            emptyLabel="暂无验证报告"
            preserveWhitespace
          />
        </div>

        {run.retryOfRunId || run.sessionId ? (
          <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="space-y-2">
              {run.retryOfRunId ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    retryOfRunId
                  </div>
                  <div className="mt-1 break-all font-mono text-xs text-foreground">
                    {run.retryOfRunId}
                  </div>
                </div>
              ) : null}

              {runSessionId ? (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      sessionId
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-foreground">
                      {runSessionId}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 px-2 text-xs"
                    disabled={isCurrentSession}
                    onClick={() => onOpenSession(runSessionId)}
                  >
                    {isCurrentSession ? '当前会话' : '打开本次会话'}
                    {isCurrentSession ? null : (
                      <ArrowUpRightIcon className="size-3.5" />
                    )}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TaskRunTextBlock(props: {
  emptyLabel: string;
  label: string;
  preserveWhitespace?: boolean;
  value: string | null;
}) {
  const { emptyLabel, label, preserveWhitespace = false, value } = props;
  const isEmpty = !value;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 text-sm leading-6 ${
          preserveWhitespace ? 'whitespace-pre-wrap break-words' : ''
        } ${isEmpty ? 'text-muted-foreground' : 'text-foreground'}`}
      >
        {value ?? emptyLabel}
      </div>
    </div>
  );
}

function TaskRunVerdictBlock(props: { verdict: string | null }) {
  const { verdict } = props;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        验证结论
      </div>
      <div className="mt-2">
        <span
          className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${verificationVerdictChipClasses(verdict)}`}
        >
          {formatVerificationVerdictLabel(verdict)}
        </span>
      </div>
    </div>
  );
}

function buildTaskRunLifecycle(run: TaskRunPanelItem) {
  const entries = [{ label: '创建', value: run.createdAt }];

  if (run.startedAt) {
    entries.push({ label: '开始', value: run.startedAt });
  }

  const completionLabel = formatTaskRunCompletionLabel(run);
  if (completionLabel) {
    entries.push({
      label: completionLabel,
      value: run.completedAt ?? run.updatedAt,
    });
  }

  return entries;
}

function formatTaskRunCompletionLabel(run: TaskRunPanelItem): string | null {
  switch (run.status) {
    case 'COMPLETED':
      return '完成';
    case 'FAILED':
      return '失败';
    case 'CANCELLED':
      return '取消';
    case 'RUNNING':
      return '最近更新';
    default:
      return run.completedAt ? '状态更新' : null;
  }
}

function TaskActionCard(props: {
  item: TaskPanelItem;
  onTaskAction: (item: TaskPanelItem, action: TaskPanelAction) => void;
  pendingTaskAction: {
    action: TaskPanelAction;
    taskId: string;
  } | null;
}) {
  const { item, onTaskAction, pendingTaskAction } = props;
  const primaryAction = getTaskPrimaryAction(item);

  if (!primaryAction) {
    return null;
  }

  const isBusy = pendingTaskAction?.taskId === item.id;
  const retryEnabled = canRetryTask(item);

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        任务操作
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs"
          disabled={isBusy || !primaryAction.enabled}
          onClick={() => onTaskAction(item, primaryAction.action)}
        >
          {isBusy && pendingTaskAction?.action === primaryAction.action
            ? primaryAction.pendingLabel
            : primaryAction.label}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={isBusy || !retryEnabled}
          onClick={() => onTaskAction(item, 'retry')}
        >
          {isBusy && pendingTaskAction?.action === 'retry'
            ? '重试中...'
            : '重试'}
        </Button>
      </div>
    </div>
  );
}

function TaskMetaBlock(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function TaskSessionLinkCard(props: {
  actionLabel: string;
  currentSessionId?: string;
  label: string;
  onOpenSession: (sessionId: string) => void;
  sessionId: string | null;
}) {
  const { actionLabel, currentSessionId, label, onOpenSession, sessionId } =
    props;
  const isCurrent = Boolean(sessionId && sessionId === currentSessionId);

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 break-all font-mono text-xs text-foreground">
            {sessionId ?? '未关联'}
          </div>
        </div>
        {sessionId ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1.5 px-2 text-xs"
            disabled={isCurrent}
            onClick={() => onOpenSession(sessionId)}
          >
            {isCurrent ? '当前会话' : actionLabel}
            {isCurrent ? null : <ArrowUpRightIcon className="size-3.5" />}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function EmptyPanel(props: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  const { description, icon, title } = props;

  return (
    <Card className="rounded-xl border-border/70 border-dashed shadow-none">
      <CardContent className="flex flex-col items-start gap-3 p-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
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
