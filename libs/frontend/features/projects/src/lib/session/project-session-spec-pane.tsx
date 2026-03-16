import type { State } from '@hateoas-ts/resource';
import type { AcpSession, Note } from '@shared/schema';
import {
  Button,
  Card,
  CardContent,
  ScrollArea,
} from '@shared/ui';
import { RefreshCwIcon, ScrollTextIcon } from 'lucide-react';
import {
  formatDateTime,
  formatSpecSyncStateLabel,
  formatTaskKindLabel,
  formatTaskSourceLabel,
  specSyncStateChipClasses,
  type SpecSyncSnapshot,
  type TaskPanelItem,
} from './project-session-workbench.shared';

export function ProjectSessionSpecPane(props: {
  note: State<Note> | null;
  onSync: () => void;
  selectedSession: State<AcpSession> | null;
  scopeSessionLabel: string | null;
  syncLoading: boolean;
  syncSnapshot: SpecSyncSnapshot | null;
  tasksLoading: boolean;
  taskItems: TaskPanelItem[];
}) {
  const {
    note,
    onSync,
    selectedSession,
    scopeSessionLabel,
    syncLoading,
    syncSnapshot,
    tasksLoading,
    taskItems,
  } = props;
  const specTasks = taskItems.filter((item) => item.sourceType === 'spec_note');

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Spec
            </p>
            <p className="mt-1 truncate text-sm font-semibold">
              {note?.data.title ?? '未创建 Spec'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {scopeSessionLabel
                ? `根会话范围 · ${scopeSessionLabel}`
                : selectedSession
                  ? `当前会话 · ${selectedSession.data.name?.trim() || selectedSession.data.id}`
                  : '尚未选择会话'}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 px-2 text-xs"
            disabled={!note || syncLoading}
            onClick={onSync}
          >
            <RefreshCwIcon
              className={`size-3.5 ${syncLoading ? 'animate-spin' : ''}`}
            />
            {syncLoading ? '同步中...' : '同步 Spec -> Tasks'}
          </Button>
        </div>
      </div>

      <ScrollArea className="h-full">
        <div className="space-y-3 p-4">
          <Card className="rounded-xl border-border/70 shadow-none">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">同步状态</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    用同一份 spec 驱动 task 拆解、委派和验证，避免根会话与子会话状态分叉。
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${specSyncStateChipClasses(syncSnapshot?.status)}`}
                >
                  {formatSpecSyncStateLabel(syncSnapshot?.status)}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <Badge label={`${syncSnapshot?.parsedCount ?? 0} 个 block`} />
                <Badge label={`${syncSnapshot?.taskCount ?? specTasks.length} 个任务`} />
                <Badge label={`${syncSnapshot?.matchedCount ?? 0} 个已对齐`} />
                {syncSnapshot?.pendingCount ? (
                  <Badge label={`${syncSnapshot.pendingCount} 个待更新`} />
                ) : null}
                {syncSnapshot && syncSnapshot.conflictCount > 0 ? (
                  <Badge
                    label={`${syncSnapshot.conflictCount} 个冲突`}
                  />
                ) : null}
              </div>

              {syncSnapshot?.parseError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {syncSnapshot.parseError}
                </div>
              ) : null}

              {!note ? (
                <EmptyState
                  description="当前根会话还没有 spec note。先通过 ROUTA 写出 Goal / Tasks / Acceptance Criteria，再同步任务。"
                  title="未找到 Spec"
                />
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/70 shadow-none">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Spec 内容</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    当前展示的是工作区实际使用的 canonical spec。
                  </p>
                </div>
                {note ? (
                  <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
                    最近更新 {formatDateTime(note.data.updatedAt)}
                  </span>
                ) : null}
              </div>

              {note ? (
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-border/60 bg-muted/20 p-4 text-sm leading-6 text-foreground">
                  {note.data.content}
                </pre>
              ) : (
                <EmptyState
                  description="Spec 建立后，这里会显示完整 markdown，便于对照 task 与子会话执行链路。"
                  title="暂无内容"
                />
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/70 shadow-none">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Spec 派生任务</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    直接展示由 spec block 派生的任务来源、类型和会话挂接，便于核对委派结果。
                  </p>
                </div>
                <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
                  {tasksLoading ? '加载中' : `${specTasks.length} 个任务`}
                </span>
              </div>

              {tasksLoading ? (
                <div className="text-sm text-muted-foreground">正在加载任务...</div>
              ) : specTasks.length === 0 ? (
                <EmptyState
                  description="当前还没有从 spec 同步出的任务。保存 spec 或手动同步后，这里会出现对应 task。"
                  title="暂无派生任务"
                />
              ) : (
                <div className="space-y-3">
                  {specTasks.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border/60 bg-muted/20 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">{item.title}</div>
                          {item.description ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {item.description}
                            </p>
                          ) : null}
                        </div>
                        <span className="rounded-full border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground">
                          {formatTaskKindLabel(item.kind)}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <Badge label={formatTaskSourceLabel(item.sourceType)} />
                        {item.sourceEntryIndex !== null &&
                        item.sourceEntryIndex !== undefined ? (
                          <Badge label={`block #${item.sourceEntryIndex + 1}`} />
                        ) : null}
                        {item.executionSessionId ? (
                          <Badge label={`执行会话 ${item.executionSessionId}`} />
                        ) : null}
                        {item.resultSessionId ? (
                          <Badge label={`结果会话 ${item.resultSessionId}`} />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}

function Badge(props: { label: string }) {
  const { label } = props;

  return (
    <span className="rounded-full border border-border/60 bg-background px-2 py-1">
      {label}
    </span>
  );
}

function EmptyState(props: {
  description: string;
  title: string;
}) {
  const { description, title } = props;

  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
        <ScrollTextIcon className="size-4" />
      </div>
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
