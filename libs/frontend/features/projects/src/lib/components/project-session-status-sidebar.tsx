import { State } from '@hateoas-ts/resource';
import { AcpEventEnvelope, AcpSession } from '@shared/schema';
import { ScrollArea } from '@shared/ui';
import { Clock3Icon, ListChecksIcon, SquareTerminalIcon } from 'lucide-react';
import {
  eventHeadline,
  eventIcon,
  eventLabel,
  formatDateTime,
  formatStatusLabel,
  renderEventDetails,
  sessionDisplayName,
  statusChipClasses,
  statusTone,
  TaskSnapshotItem,
} from './project-session-workbench.shared';

export function ProjectSessionStatusSidebar(props: {
  events: AcpEventEnvelope[];
  selectedSession: State<AcpSession> | null;
  taskItems: TaskSnapshotItem[];
}) {
  const { events, selectedSession, taskItems } = props;
  const recentEvents = events.slice(-10).reverse();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              工作台
            </p>
            <p className="mt-1 text-sm font-medium">
              {taskItems.length > 0 ? '任务面板' : '运行记录'}
            </p>
          </div>
          {taskItems.length > 0 ? (
            <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              {taskItems.length} 项
            </span>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 space-y-4 p-4">
        {taskItems.length > 0 ? (
          <section className="rounded-2xl border bg-background p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ListChecksIcon className="size-4 text-muted-foreground" />
              任务概览
            </div>
            <div className="mt-3 space-y-2">
              {taskItems.map((item) => (
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
              value={selectedSession ? sessionDisplayName(selectedSession) : '未选择会话'}
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
                <p className="text-sm text-muted-foreground">还没有运行记录。</p>
              ) : (
                recentEvents.map((event) => (
                  <div
                    key={event.eventId}
                    className="rounded-2xl border bg-muted/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {event.type === 'tool_call' || event.type === 'tool_result'
                          ? eventIcon.tool
                          : eventIcon.default}
                        <div>
                          <div className="text-sm font-medium">{eventLabel(event)}</div>
                          <div className="text-xs text-muted-foreground">
                            {eventHeadline(event)}
                          </div>
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatDateTime(event.emittedAt)}
                      </div>
                    </div>
                    {taskItems.length === 0 ? renderEventDetails(event) : null}
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
