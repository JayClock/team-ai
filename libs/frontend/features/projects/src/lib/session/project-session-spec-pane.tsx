import type { State } from '@hateoas-ts/resource';
import type { AcpSession, Note } from '@shared/schema';
import {
  Button,
  Card,
  CardContent,
  ScrollArea,
  toast,
} from '@shared/ui';
import { runtimeFetch } from '@shared/util-http';
import { ScrollTextIcon } from 'lucide-react';
import { useState } from 'react';
import {
  formatDateTime,
  formatTaskKindLabel,
  formatTaskWorkflowColumnLabel,
  formatTaskSourceLabel,
  type TaskPanelItem,
} from './project-session-workbench.shared';

export function ProjectSessionSpecPane(props: {
  note: State<Note> | null;
  onSyncComplete?: () => Promise<void> | void;
  selectedSession: State<AcpSession> | null;
  scopeSessionLabel: string | null;
  tasksLoading: boolean;
  taskItems: TaskPanelItem[];
}) {
  const {
    note,
    onSyncComplete,
    selectedSession,
    scopeSessionLabel,
    tasksLoading,
    taskItems,
  } = props;
  const specTasks = taskItems.filter((item) => item.sourceType === 'spec_note');
  const [syncPending, setSyncPending] = useState(false);

  async function handleSyncSpec() {
    const projectId = note?.data.projectId ?? selectedSession?.data.project.id;
    if (!projectId) {
      toast.error('无法确定当前项目，暂时不能同步 Spec。');
      return;
    }

    setSyncPending(true);

    try {
      const response = await runtimeFetch(`/api/projects/${projectId}/spec/sync`, {
        body: JSON.stringify({
          noteId: note?.data.id,
          sessionId: selectedSession?.data.id,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`同步失败: ${response.status}`);
      }

      const payload = (await response.json()) as {
        archivedCount: number;
        createdCount: number;
        updatedCount: number;
      };
      toast.success(
        `已同步到看板：新增 ${payload.createdCount}，更新 ${payload.updatedCount}，归档 ${payload.archivedCount}`,
      );
      await onSyncComplete?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : '同步 Spec 失败';
      toast.error(message);
    } finally {
      setSyncPending(false);
    }
  }

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
        </div>
      </div>

      <ScrollArea className="h-full">
        <div className="space-y-3 p-4">
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
                  description="Spec 建立后，这里会显示完整 markdown，便于对照当前工作区的执行链路。"
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
                    展示当前由 canonical spec 同步出来的卡片来源、类型和会话挂接，便于核对历史上下文。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
                    {tasksLoading ? '加载中' : `${specTasks.length} 个任务`}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={syncPending || !note}
                    onClick={() => void handleSyncSpec()}
                  >
                    {syncPending ? '同步中...' : '同步到看板'}
                  </Button>
                </div>
              </div>

              {tasksLoading ? (
                <div className="text-sm text-muted-foreground">正在加载任务...</div>
              ) : specTasks.length === 0 ? (
                <EmptyState
                  description="当前没有与 spec note 直接关联的任务。点击“同步到看板”后，@@@task blocks 会物化成真实卡片。"
                  title="暂无关联任务"
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
                        {item.columnId ? (
                          <Badge
                            label={`lane ${formatTaskWorkflowColumnLabel(item.columnId)}`}
                          />
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
