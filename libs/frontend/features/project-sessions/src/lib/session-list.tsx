import { State } from '@hateoas-ts/resource';
import { AcpSessionSummary } from '@shared/schema';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ScrollArea,
} from '@shared/ui';
import {
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  countSessionTree,
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

export function SessionList(props: {
  loading: boolean;
  onDelete: (session: State<AcpSessionSummary>) => void;
  onOpenRename: (session: State<AcpSessionSummary>) => void;
  onSelect: (session: State<AcpSessionSummary>) => void;
  selectedSessionId?: string;
  sessions: SessionTreeNode[];
}) {
  const {
    loading,
    onDelete,
    onOpenRename,
    onSelect,
    selectedSessionId,
    sessions,
  } = props;
  const totalSessions = sessions.reduce(
    (count, node) => count + countSessionTree(node),
    0,
  );

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
                node={node}
                selectedSessionId={selectedSessionId}
                onDelete={onDelete}
                onOpenRename={onOpenRename}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SessionTreeItem(props: {
  node: SessionTreeNode;
  onDelete: (session: State<AcpSessionSummary>) => void;
  onOpenRename: (session: State<AcpSessionSummary>) => void;
  onSelect: (session: State<AcpSessionSummary>) => void;
  selectedSessionId?: string;
  depth?: number;
}) {
  const {
    node,
    onDelete,
    onOpenRename,
    onSelect,
    selectedSessionId,
    depth = 0,
  } = props;
  const active = node.session.data.id === selectedSessionId;

  return (
    <div className="space-y-2">
      <div
        className={`rounded-2xl border transition ${
          active
            ? 'border-primary bg-primary/5 shadow-sm'
            : 'border-border bg-background'
        }`}
        style={{ marginLeft: depth * 14 }}
      >
        <div className="flex items-start gap-2 px-3 py-3">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => onSelect(node.session)}
          >
            <div className="flex min-w-0 items-center gap-2">
              <MessageSquareTextIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-medium">
                {sessionDisplayName(node.session)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>{formatStatusLabel(node.session.data.state)}</span>
              <span>{node.session.data.provider}</span>
              {node.session.data.task?.id ? (
                <span>任务 {node.session.data.task.id}</span>
              ) : null}
              <span>{formatDateTime(node.session.data.lastActivityAt)}</span>
            </div>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontalIcon />
                <span className="sr-only">会话操作</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOpenRename(node.session)}>
                <PencilIcon />
                重命名
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(node.session)}
              >
                <Trash2Icon />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {node.children.length > 0 ? (
        <div className="space-y-2">
          {node.children.map((child) => (
            <SessionTreeItem
              key={child.session.data.id}
              node={child}
              depth={depth + 1}
              selectedSessionId={selectedSessionId}
              onDelete={onDelete}
              onOpenRename={onOpenRename}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
