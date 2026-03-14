import { State } from '@hateoas-ts/resource';
import { AcpSession } from '@shared/schema';
import {
  Button,
  Card,
  CardContent,
  Spinner,
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
  type TaskStatus,
} from '@shared/ui';
import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  Clock3Icon,
  ListChecksIcon,
  LoaderCircleIcon,
  SparklesIcon,
  WrenchIcon,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import {
  formatDateTime,
  formatStatusLabel,
  formatTaskKindLabel,
  sessionDisplayName,
  statusChipClasses,
  statusTone,
  type TaskPanelItem,
} from './project-session-workbench.shared';

const runningStatuses = new Set([
  'RUNNING',
  'running',
  'in_progress',
  'connecting',
]);
const completedStatuses = new Set(['COMPLETED', 'completed', 'connected']);
const failureStatuses = new Set([
  'FAILED',
  'failed',
  'CANCELLED',
  'cancelled',
  'BLOCKED',
  'blocked',
  'WAITING_RETRY',
  'error',
  'error-stream',
]);
const queuedStatuses = new Set(['PENDING', 'pending', 'READY', 'ready']);

function segmentWidth(value: number, total: number): string {
  if (total <= 0 || value <= 0) {
    return '0%';
  }
  return `${(value / total) * 100}%`;
}

function taskSourceLabel(source: TaskPanelItem['source']): string {
  switch (source) {
    case 'task':
      return 'Task';
    case 'plan':
      return 'Plan';
    case 'tool':
      return 'Tool';
  }
}

function summarizeTaskBuckets(taskItems: TaskPanelItem[]) {
  return taskItems.reduce(
    (summary, item) => {
      if (completedStatuses.has(item.status)) {
        summary.completed += 1;
        return summary;
      }
      if (runningStatuses.has(item.status)) {
        summary.running += 1;
        return summary;
      }
      if (failureStatuses.has(item.status)) {
        summary.failed += 1;
        return summary;
      }
      if (queuedStatuses.has(item.status)) {
        summary.queued += 1;
        return summary;
      }
      summary.idle += 1;
      return summary;
    },
    {
      completed: 0,
      failed: 0,
      idle: 0,
      queued: 0,
      running: 0,
    },
  );
}

function sourceIcon(source: TaskPanelItem['source']) {
  switch (source) {
    case 'task':
      return <ListChecksIcon className="size-3.5" />;
    case 'plan':
      return <SparklesIcon className="size-3.5" />;
    case 'tool':
      return <WrenchIcon className="size-3.5" />;
  }
}

function taskStatus(status: string): TaskStatus {
  if (completedStatuses.has(status)) {
    return 'completed';
  }
  if (runningStatuses.has(status)) {
    return 'in_progress';
  }
  if (failureStatuses.has(status)) {
    return 'error';
  }
  return 'pending';
}

function TaskMetric(props: {
  icon: ReactNode;
  label: string;
  toneClassName: string;
  value: number;
}) {
  const { icon, label, toneClassName, value } = props;

  return (
    <div className="rounded-xl border border-border/60 bg-background/90 px-3 py-2">
      <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        <span className={`inline-flex size-5 items-center justify-center rounded-full ${toneClassName}`}>
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>
  );
}

export function ProjectSessionTaskStrip(props: {
  activityCount: number;
  selectedSession: State<AcpSession> | null;
  streamStatus: string;
  taskItems: TaskPanelItem[];
  tasksLoading: boolean;
}) {
  const {
    activityCount,
    selectedSession,
    streamStatus,
    taskItems,
    tasksLoading,
  } = props;
  const [expanded, setExpanded] = useState(false);
  const bucketSummary = useMemo(() => summarizeTaskBuckets(taskItems), [taskItems]);
  const sourceSummary = useMemo(
    () =>
      taskItems.reduce(
        (summary, item) => {
          summary[item.source] += 1;
          return summary;
        },
        {
          plan: 0,
          task: 0,
          tool: 0,
        },
      ),
    [taskItems],
  );
  const visibleItems = expanded ? taskItems : taskItems.slice(0, 3);
  const shouldRender =
    Boolean(selectedSession) ||
    tasksLoading ||
    taskItems.length > 0 ||
    activityCount > 0;

  if (!shouldRender) {
    return null;
  }

  return (
    <Card className="mb-3 overflow-hidden rounded-2xl border-border/70 bg-gradient-to-br from-background via-muted/20 to-background shadow-none">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border/60 bg-background/90 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Task Pulse
              </span>
              <span
                className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${statusChipClasses(streamStatus)}`}
              >
                <span className={`size-1.5 rounded-full ${statusTone(streamStatus)}`} />
                {formatStatusLabel(streamStatus)}
              </span>
              {tasksLoading ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground">
                  <Spinner className="size-3" />
                  同步中
                </span>
              ) : null}
            </div>

            <div className="mt-3 text-sm font-semibold">
              {selectedSession ? sessionDisplayName(selectedSession) : '当前对话'}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedSession?.data.provider ?? '未选择 provider'}
              {selectedSession?.data.lastActivityAt
                ? ` · 最近活动 ${formatDateTime(selectedSession.data.lastActivityAt)}`
                : ''}
              {` · ${activityCount} 条活动`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full border border-border/60 bg-background/90 px-2 py-1">
              {taskItems.length} 项快照
            </span>
            <span className="rounded-full border border-border/60 bg-background/90 px-2 py-1">
              {sourceSummary.task} task
            </span>
            <span className="rounded-full border border-border/60 bg-background/90 px-2 py-1">
              {sourceSummary.plan} plan
            </span>
            <span className="rounded-full border border-border/60 bg-background/90 px-2 py-1">
              {sourceSummary.tool} tool
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-muted/80">
            <div className="flex h-full w-full">
              <div
                className="bg-emerald-500"
                style={{
                  width: segmentWidth(bucketSummary.completed, taskItems.length),
                }}
              />
              <div
                className="bg-amber-500"
                style={{
                  width: segmentWidth(bucketSummary.running, taskItems.length),
                }}
              />
              <div
                className="bg-sky-500"
                style={{
                  width: segmentWidth(bucketSummary.queued, taskItems.length),
                }}
              />
              <div
                className="bg-rose-500"
                style={{
                  width: segmentWidth(bucketSummary.failed, taskItems.length),
                }}
              />
              <div
                className="bg-slate-300"
                style={{
                  width: segmentWidth(bucketSummary.idle, taskItems.length),
                }}
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <TaskMetric
              icon={<CheckCircle2Icon className="size-3.5 text-emerald-700" />}
              label="已完成"
              toneClassName="bg-emerald-50"
              value={bucketSummary.completed}
            />
            <TaskMetric
              icon={<LoaderCircleIcon className="size-3.5 text-amber-700" />}
              label="处理中"
              toneClassName="bg-amber-50"
              value={bucketSummary.running}
            />
            <TaskMetric
              icon={<Clock3Icon className="size-3.5 text-sky-700" />}
              label="排队中"
              toneClassName="bg-sky-50"
              value={bucketSummary.queued}
            />
            <TaskMetric
              icon={<AlertTriangleIcon className="size-3.5 text-rose-700" />}
              label="失败 / 等待重试"
              toneClassName="bg-rose-50"
              value={bucketSummary.failed}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Recent Work
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                优先显示最近同步到的 task / plan / tool 快照。
              </p>
            </div>
            {taskItems.length > 3 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 rounded-lg px-2 text-xs"
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded ? '收起' : '展开全部'}
                {expanded ? (
                  <ChevronUpIcon className="size-3.5" />
                ) : (
                  <ChevronDownIcon className="size-3.5" />
                )}
              </Button>
            ) : null}
          </div>

          {taskItems.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-border/60 bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
              当前还没有 task、plan 或 tool 快照。开始一轮编排后，这里会立即显示任务进度。
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {visibleItems.map((item, index) => (
                <Task
                  key={item.id}
                  defaultOpen={index === 0}
                  className="bg-background/90"
                >
                  <TaskTrigger
                    title={item.title}
                    icon={sourceIcon(item.source)}
                    status={taskStatus(item.status)}
                    description={
                      item.description ?? `${taskSourceLabel(item.source)} 快照`
                    }
                    trailing={
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${statusChipClasses(item.status)}`}
                      >
                        {formatStatusLabel(item.status)}
                      </span>
                    }
                  />
                  <TaskContent>
                    <TaskItem>
                      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                          {taskSourceLabel(item.source)}
                        </span>
                        {item.kind ? (
                          <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                            {formatTaskKindLabel(item.kind)}
                          </span>
                        ) : null}
                        {item.assignedProvider ? (
                          <span className="rounded-full border border-border/60 bg-background px-2 py-1 font-mono">
                            {item.assignedProvider}
                          </span>
                        ) : null}
                        {item.assignedRole ? (
                          <span className="rounded-full border border-border/60 bg-background px-2 py-1 font-mono">
                            {item.assignedRole}
                          </span>
                        ) : null}
                      </div>
                    </TaskItem>
                    {item.description ? (
                      <TaskItem>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {item.description}
                        </p>
                      </TaskItem>
                    ) : null}
                  </TaskContent>
                </Task>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full border border-border/60 bg-background/90 px-2 py-1">
            <ActivityIcon className="mr-1 inline size-3.5" />
            {activityCount} 条活动
          </span>
          {selectedSession?.data.specialistId ? (
            <span className="rounded-full border border-border/60 bg-background/90 px-2 py-1 font-mono">
              {selectedSession.data.specialistId}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
