import { State } from '@hateoas-ts/resource';
import {
  AcpEventEnvelope,
  AcpSession,
  Role,
  Specialist,
  Task,
} from '@shared/schema';
import { Button, ScrollArea } from '@shared/ui';
import { Clock3Icon, ListChecksIcon, SquareTerminalIcon } from 'lucide-react';
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
} from './project-session-workbench.shared';

export function ProjectSessionStatusSidebar(props: {
  events: AcpEventEnvelope[];
  onOpenTask: (task: State<Task>) => void | Promise<void>;
  roleById: Map<string, State<Role>>;
  selectedSession: State<AcpSession> | null;
  selectedTask: State<Task> | null;
  specialistById: Map<string, State<Specialist>>;
  taskSnapshotItems: TaskSnapshotItem[];
}) {
  const {
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              工作台
            </p>
            <p className="mt-1 text-sm font-medium">
              {selectedTask
                ? '任务详情'
                : taskSnapshotItems.length > 0
                  ? '任务运行摘要'
                  : '运行记录'}
            </p>
          </div>
          {selectedTask ? (
            <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              {formatTaskKindLabel(selectedTask.data.kind)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 space-y-4 p-4">
        {selectedTask ? (
          <section className="rounded-2xl border bg-background p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ListChecksIcon className="size-4 text-muted-foreground" />
                  <span className="truncate">{selectedTask.data.title}</span>
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

            <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <MetadataRow
                label="类型"
                value={formatTaskKindLabel(selectedTask.data.kind)}
              />
              <MetadataRow label="角色" value={assignedRole} />
              <MetadataRow label="Specialist" value={assignedSpecialist} />
              <MetadataRow
                label="依赖"
                value={String(selectedTask.data.dependencies.length)}
              />
              <MetadataRow
                label="执行 Session"
                value={selectedTask.data.executionSessionId ?? '无'}
              />
              <MetadataRow
                label="最近结果"
                value={selectedTask.data.resultSessionId ?? '无'}
              />
            </div>

            {selectedTask.data.scope ? (
              <div className="mt-4 rounded-2xl bg-muted/30 p-3 text-sm text-muted-foreground">
                {selectedTask.data.scope}
              </div>
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

            <div className="mt-4 flex items-center gap-2">
              <Button size="sm" onClick={() => void onOpenTask(selectedTask)}>
                {actionLabel}
              </Button>
            </div>
          </section>
        ) : null}

        {!selectedTask && taskSnapshotItems.length > 0 ? (
          <section className="rounded-2xl border bg-background p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ListChecksIcon className="size-4 text-muted-foreground" />
              运行摘要
            </div>
            <div className="mt-3 space-y-2">
              {taskSnapshotItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border bg-muted/20 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-2 shrink-0 rounded-full ${statusTone(item.status)}`}
                        />
                        <div className="truncate text-sm font-medium">
                          {item.title}
                        </div>
                      </div>
                      {item.description ? (
                        <p className="mt-2 text-xs text-muted-foreground">
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
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border bg-background p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock3Icon className="size-4 text-muted-foreground" />
            会话信息
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <MetadataRow
              label="标题"
              value={
                selectedSession
                  ? sessionDisplayName(selectedSession)
                  : '未选择会话'
              }
            />
            <MetadataRow
              label="状态"
              value={formatStatusLabel(selectedSession?.data.state)}
            />
            <MetadataRow
              label="最近活跃"
              value={
                selectedSession?.data.lastActivityAt
                  ? formatDateTime(selectedSession.data.lastActivityAt)
                  : '无'
              }
            />
          </div>
        </section>
      </div>

      <div className="min-h-0 flex-1 px-4 pb-4">
        <section className="flex h-full min-h-0 flex-col rounded-2xl border bg-background">
          <div className="shrink-0 border-b px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <SquareTerminalIcon className="size-4 text-muted-foreground" />
              运行记录
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-4">
              {recentEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  还没有运行记录。
                </p>
              ) : (
                recentEvents.map((event) => (
                  <div
                    key={event.eventId}
                    className="rounded-2xl border bg-muted/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {event.type === 'tool_call' ||
                        event.type === 'tool_result'
                          ? eventIcon.tool
                          : eventIcon.default}
                        <div>
                          <div className="text-sm font-medium">
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
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </section>
      </div>
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

function TaskListCard(props: { items: string[]; title: string }) {
  const { items, title } = props;

  return (
    <div className="mt-4 rounded-2xl border bg-muted/10 p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </div>
      <div className="mt-2 space-y-2 text-sm">
        {items.map((item, index) => (
          <div
            key={`${title}-${index}`}
            className="rounded-xl bg-background px-3 py-2"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
