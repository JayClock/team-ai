import { State } from '@hateoas-ts/resource';
import { AcpEventEnvelope, AcpSession } from '@shared/schema';
import {
  Card,
  CardContent,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui';
import { ActivityIcon, ListChecksIcon } from 'lucide-react';
import type { ReactNode } from 'react';
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
  streamStatus: string;
  taskSnapshotItems: TaskSnapshotItem[];
}) {
  const { events, selectedSession, streamStatus, taskSnapshotItems } = props;
  const recentEvents = events.slice(-12).reverse();
  const defaultTab = taskSnapshotItems.length > 0 ? 'tasks' : 'activity';

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
              {taskSnapshotItems.length === 0 ? (
                <EmptyPanel
                  icon={
                    <ListChecksIcon className="size-4 text-muted-foreground" />
                  }
                  title="还没有任务快照"
                  description="当会话产生 plan 或 tool 调用时，这里会显示与 Routa 一致的任务概览。"
                />
              ) : (
                taskSnapshotItems.map((item) => (
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
