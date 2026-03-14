import { State } from '@hateoas-ts/resource';
import { AcpSessionSummary } from '@shared/schema';
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ScrollArea,
} from '@shared/ui';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  MessageSquareTextIcon,
  SparklesIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  countSessionTree,
  findSessionPathIds,
  SessionTreeNode,
  sessionDisplayName,
} from './session-tree';

function formatDateTime(value: string | null): string {
  if (!value) {
    return '无';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'PENDING':
    case 'pending':
      return '待处理';
    case 'READY':
    case 'ready':
      return '就绪';
    case 'COMPLETED':
    case 'completed':
      return '已完成';
    case 'RUNNING':
    case 'running':
      return '进行中';
    case 'in_progress':
      return '处理中';
    case 'BLOCKED':
    case 'blocked':
      return '已阻塞';
    case 'FAILED':
    case 'failed':
      return '失败';
    case 'CANCELLED':
    case 'cancelled':
      return '已取消';
    default:
      return status?.trim() || '无';
  }
}

function statusChipClasses(status: string | null | undefined): string {
  switch (status) {
    case 'PENDING':
    case 'pending':
    case 'READY':
    case 'ready':
      return 'bg-sky-50 text-sky-700 ring-sky-200';
    case 'COMPLETED':
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'RUNNING':
    case 'running':
    case 'in_progress':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    case 'FAILED':
    case 'failed':
    case 'BLOCKED':
    case 'blocked':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 'CANCELLED':
    case 'cancelled':
      return 'bg-slate-100 text-slate-600 ring-slate-200';
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-200';
  }
}

function sessionHierarchyLabel(
  _session: State<AcpSessionSummary>,
  depth: number,
): string {
  if (depth === 0) {
    return '根会话';
  }

  return '子会话';
}

export function SessionList(props: {
  loading: boolean;
  onSelect: (session: State<AcpSessionSummary>) => void;
  selectedSessionId?: string;
  sessions: SessionTreeNode[];
}) {
  const { loading, onSelect, selectedSessionId, sessions } = props;
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const totalSessions = sessions.reduce(
    (count, node) => count + countSessionTree(node),
    0,
  );
  const selectedPathIds = useMemo(
    () => findSessionPathIds(sessions, selectedSessionId),
    [selectedSessionId, sessions],
  );
  const selectedPathSet = useMemo(
    () => new Set(selectedPathIds),
    [selectedPathIds],
  );
  const expandedIdSet = useMemo(() => new Set(expandedIds), [expandedIds]);

  const toggleSessionBranch = (sessionId: string) => {
    setExpandedIds((current) =>
      current.includes(sessionId)
        ? current.filter((value) => value !== sessionId)
        : [...current, sessionId],
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          会话
        </p>
        <p className="mt-1 text-sm font-medium">共 {totalSessions} 个会话</p>
      </div>

      <ScrollArea className="h-full">
        <div className="space-y-2 p-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">正在加载会话...</p>
          ) : sessions.length === 0 ? (
            <Empty className="border-dashed px-4 py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquareTextIcon className="size-5" />
                </EmptyMedia>
                <EmptyTitle>还没有会话</EmptyTitle>
                <EmptyDescription>
                  点击顶部"新建会话"开始第一个会话。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            sessions.map((node) => (
              <SessionTreeItem
                key={node.session.data.id}
                depth={0}
                expandedIdSet={expandedIdSet}
                node={node}
                onSelect={onSelect}
                onToggle={toggleSessionBranch}
                selectedPathSet={selectedPathSet}
                selectedSessionId={selectedSessionId}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SessionTreeItem(props: {
  depth: number;
  expandedIdSet: Set<string>;
  node: SessionTreeNode;
  onSelect: (session: State<AcpSessionSummary>) => void;
  onToggle: (sessionId: string) => void;
  selectedPathSet: Set<string>;
  selectedSessionId?: string;
}) {
  const {
    depth,
    expandedIdSet,
    node,
    onSelect,
    onToggle,
    selectedPathSet,
    selectedSessionId,
  } = props;
  const sessionId = node.session.data.id;
  const active = sessionId === selectedSessionId;
  const containsSelected = selectedPathSet.has(sessionId);
  const hasChildren = node.children.length > 0;
  const isExpanded =
    hasChildren && (expandedIdSet.has(sessionId) || containsSelected);
  const childSessionCount = countSessionTree(node) - 1;
  const hierarchyLabel = sessionHierarchyLabel(node.session, depth);
  const specialistLabel =
    node.session.data.specialistId?.trim() || '未指定 specialist';
  const showTimestamp = depth === 0 || active;
  const sessionStatus = node.session.data.acpStatus;

  return (
    <div className="space-y-2">
      <div
        className={`rounded-2xl border transition ${
          active
            ? 'border-primary bg-primary/5 shadow-sm'
            : containsSelected
              ? 'border-border/80 bg-muted/20'
              : 'border-border/70 bg-background'
        }`}
      >
        <div className="flex items-start gap-2 px-3 py-3">
          {hasChildren ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="mt-1 h-8 w-8 shrink-0 rounded-xl text-muted-foreground"
              onClick={() => onToggle(sessionId)}
              aria-label={isExpanded ? '收起子会话' : '展开子会话'}
            >
              {isExpanded ? (
                <ChevronDownIcon className="size-4" />
              ) : (
                <ChevronRightIcon className="size-4" />
              )}
            </Button>
          ) : (
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 text-muted-foreground">
              <MessageSquareTextIcon className="size-4" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <button
              type="button"
              className="w-full min-w-0 text-left"
              onClick={() => onSelect(node.session)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${
                    depth === 0
                      ? 'bg-primary/10 text-primary ring-primary/15'
                      : 'bg-muted/60 text-foreground/70 ring-border/60'
                  }`}
                >
                  {hierarchyLabel}
                </span>
                {hasChildren ? (
                  <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                    {childSessionCount} 个子会话
                  </span>
                ) : null}
                {active ? (
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                    当前会话
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex min-w-0 items-start gap-3">
                <div
                  className={`flex size-9 shrink-0 items-center justify-center rounded-2xl border ${
                    depth === 0
                      ? 'border-primary/20 bg-primary/10 text-primary'
                      : 'border-border/60 bg-muted/40 text-foreground/70'
                  }`}
                >
                  {depth === 0 ? (
                    <SparklesIcon className="size-4" />
                  ) : (
                    <MessageSquareTextIcon className="size-4" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {sessionDisplayName(node.session)}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span
                      className={`rounded-full px-2 py-1 font-medium ring-1 ${statusChipClasses(sessionStatus)}`}
                    >
                      {formatStatusLabel(sessionStatus)}
                    </span>
                    <span className="rounded-full border border-border/60 bg-background px-2 py-1 font-mono">
                      {node.session.data.provider ?? 'opencode'}
                    </span>
                    <span className="rounded-full border border-border/60 bg-background px-2 py-1 font-mono">
                      {specialistLabel}
                    </span>
                  </div>

                  {showTimestamp ? (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      最近活动{' '}
                      {formatDateTime(
                        node.session.data.lastActivityAt ??
                          node.session.data.startedAt ??
                          node.session.data.completedAt,
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </button>

          </div>

        </div>
      </div>

      {hasChildren && isExpanded ? (
        <div className="ml-4 border-l border-border/60 pl-4">
          <div className="space-y-2">
            {node.children.map((child) => (
              <SessionTreeItem
                key={child.session.data.id}
                depth={depth + 1}
                expandedIdSet={expandedIdSet}
                node={child}
                onSelect={onSelect}
                onToggle={onToggle}
                selectedPathSet={selectedPathSet}
                selectedSessionId={selectedSessionId}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
