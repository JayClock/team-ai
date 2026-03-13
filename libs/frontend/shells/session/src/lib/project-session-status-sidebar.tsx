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
  canRetryTask,
  describeTaskExecutionStatus,
  eventHeadline,
  eventIcon,
  eventLabel,
  formatDateTime,
  formatStatusLabel,
  formatTaskKindLabel,
  getTaskPrimaryAction,
  renderEventDetails,
  sessionDisplayName,
  statusChipClasses,
  statusTone,
  type TaskPanelAction,
  type TaskPanelItem,
} from './project-session-workbench.shared';

export function ProjectSessionStatusSidebar(props: {
  events: AcpEventEnvelope[];
  onOpenSession: (sessionId: string) => void;
  onTaskAction: (item: TaskPanelItem, action: TaskPanelAction) => void;
  pendingTaskAction: {
    action: TaskPanelAction;
    taskId: string;
  } | null;
  selectedSession: State<AcpSession> | null;
  streamStatus: string;
  taskItems: TaskPanelItem[];
  tasksLoading: boolean;
}) {
  const {
    events,
    onOpenSession,
    onTaskAction,
    pendingTaskAction,
    selectedSession,
    streamStatus,
    taskItems,
    tasksLoading,
  } = props;
  const recentEvents = events.slice(-12).reverse();
  const defaultTab =
    taskItems.length > 0 || tasksLoading ? 'tasks' : 'activity';

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
              {selectedSession?.data.provider ?? 'opencode'}
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
        key={defaultTab}
        defaultValue={defaultTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-border/60 px-3 py-2">
          <TabsList className="grid h-9 w-full grid-cols-2 rounded-lg bg-muted/70">
            <TabsTrigger value="tasks" className="rounded-md text-xs">
              Tasks
            </TabsTrigger>
            <TabsTrigger value="activity" className="rounded-md text-xs">
              Activity
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
                taskItems.map((item) => (
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
                ))
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
                          {event.type === 'tool_call' ||
                          event.type === 'tool_result'
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
      </Tabs>
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
        {item.assignedProvider ? (
          <span className="rounded-full border border-border/60 bg-background px-2 py-1 font-mono">
            {item.assignedProvider}
          </span>
        ) : null}
      </div>

      {executionStatus ? (
        <TaskMetaBlock label="当前执行状态" value={executionStatus} />
      ) : null}

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
