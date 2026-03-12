import { State } from '@hateoas-ts/resource';
import {
  AcpEventEnvelope,
  AcpSession,
  AcpSessionSummary,
  type AcpCompleteEventData,
  type AcpErrorEventData,
  type AcpPlanEventData,
  type AcpSessionEventData,
  type AcpToolCallEventData,
  type AcpToolResultEventData,
} from '@shared/schema';
import { WrenchIcon, SparklesIcon } from 'lucide-react';

export type TaskSnapshotItem = {
  description?: string;
  id: string;
  source: 'plan' | 'tool';
  status: string;
  title: string;
};

export type SessionTreeNode = {
  children: SessionTreeNode[];
  session: State<AcpSessionSummary>;
};

export type SidebarTab = 'sessions' | 'spec' | 'tasks';

export function sessionDisplayName(
  session: State<AcpSessionSummary> | State<AcpSession>,
): string {
  const name = session.data.name?.trim();
  if (name) {
    return name;
  }
  return `会话 ${session.data.id}`;
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return '无';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function formatStatusLabel(status: string | null | undefined): string {
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
    case 'connected':
      return '已连接';
    case 'connecting':
      return '连接中';
    case 'idle':
      return '空闲';
    case 'error':
    case 'error-stream':
      return '错误';
    default:
      return status?.trim() || '无';
  }
}

export function formatTaskKindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case 'plan':
      return '规划';
    case 'implement':
      return '实现';
    case 'review':
      return '复核';
    case 'verify':
      return '验证';
    default:
      return kind?.trim() || '未分类';
  }
}

function formatPriorityLabel(priority: string | null | undefined): string {
  switch (priority?.toLowerCase()) {
    case 'high':
      return '高优先级';
    case 'medium':
      return '中优先级';
    case 'low':
      return '低优先级';
    default:
      return priority?.trim() || '未标注';
  }
}

export function eventLabel(event: AcpEventEnvelope): string {
  switch (event.type) {
    case 'tool_call':
      return '工具调用';
    case 'tool_result':
      return '工具结果';
    case 'session':
      return '会话';
    case 'plan':
      return '计划';
    case 'usage':
      return '上下文用量';
    case 'mode':
      return '模式';
    case 'config':
      return '配置';
    case 'complete':
      return '完成';
    case 'error':
      return '错误';
    case 'status':
      return '状态';
    case 'message':
      return '消息';
  }
}

export function eventHeadline(event: AcpEventEnvelope): string {
  switch (event.type) {
    case 'tool_call':
      return event.data.title ?? event.data.toolName ?? '工具调用';
    case 'tool_result':
      return event.data.title ?? event.data.toolName ?? '工具结果';
    case 'plan':
      return `共 ${event.data.entries.length} 项计划`;
    case 'usage':
      return `${event.data.used}/${event.data.size} 上下文令牌`;
    case 'session':
      return (
        event.data.reason ??
        event.data.title ??
        formatStatusLabel(event.data.state) ??
        '会话'
      );
    case 'mode':
      return event.data.currentModeId;
    case 'config':
      return `共 ${event.data.configOptions.length} 个配置项`;
    case 'complete':
      return event.data.stopReason ?? event.data.reason ?? '已完成';
    case 'error':
      return event.error?.message ?? event.data.message ?? '发生错误';
    case 'status':
      return (
        event.data.reason ?? formatStatusLabel(event.data.state) ?? '状态更新'
      );
    case 'message':
      return event.data.role ?? '消息';
  }
}

export function summarizeSessionEvent(event: AcpEventEnvelope): string | null {
  switch (event.type) {
    case 'session': {
      const data = event.data as AcpSessionEventData;
      if (data.reason === 'session_created') {
        return '会话已创建，可以直接继续对话。';
      }
      if (data.title) {
        return `会话标题已更新为 ${data.title}。`;
      }
      if (data.state) {
        return `会话状态已变更为${formatStatusLabel(data.state)}。`;
      }
      return null;
    }
    case 'complete': {
      const data = event.data as AcpCompleteEventData;
      if (data.state === 'CANCELLED' || data.stopReason === 'cancelled') {
        return '本次对话已取消。';
      }
      return '本轮对话已结束。';
    }
    case 'error': {
      const data = event.data as AcpErrorEventData;
      return data.message ?? event.error?.message ?? '执行过程中发生错误。';
    }
    default:
      return null;
  }
}

export function statusTone(status: string): string {
  switch (status) {
    case 'PENDING':
    case 'pending':
    case 'READY':
    case 'ready':
      return 'bg-sky-500';
    case 'completed':
    case 'COMPLETED':
    case 'connected':
      return 'bg-emerald-500';
    case 'running':
    case 'RUNNING':
    case 'in_progress':
    case 'connecting':
      return 'bg-amber-500';
    case 'FAILED':
    case 'failed':
    case 'error':
    case 'CANCELLED':
    case 'cancelled':
    case 'BLOCKED':
    case 'blocked':
      return 'bg-rose-500';
    default:
      return 'bg-slate-400';
  }
}

export function statusChipClasses(status: string): string {
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
    case 'error':
    case 'BLOCKED':
    case 'blocked':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 'CANCELLED':
    case 'cancelled':
      return 'bg-slate-100 text-slate-600 ring-slate-200';
    case 'connected':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'connecting':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    case 'idle':
      return 'bg-slate-100 text-slate-600 ring-slate-200';
    case 'error-stream':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-200';
  }
}

export function renderEventDetails(event: AcpEventEnvelope) {
  const rawPayload = event.data.payload;

  if (event.type === 'tool_call' || event.type === 'tool_result') {
    const data =
      event.type === 'tool_call'
        ? (event.data as AcpToolCallEventData)
        : (event.data as AcpToolResultEventData);
    const primaryValue =
      event.type === 'tool_call'
        ? ((data as AcpToolCallEventData).input ?? data.rawInput)
        : ((data as AcpToolResultEventData).output ?? data.rawOutput);

    return (
      <div className="mt-3 space-y-2">
        {primaryValue !== undefined ? (
          <pre className="overflow-x-auto rounded-xl border bg-muted/60 p-3 text-xs">
            {typeof primaryValue === 'string'
              ? primaryValue
              : formatJson(primaryValue)}
          </pre>
        ) : null}
        {data.locations && data.locations.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {data.locations.map((location, index) => (
              <span
                key={`${location.path}-${index}`}
                className="rounded-full border bg-background px-2 py-1"
              >
                {location.path}
                {location.line ? `:${location.line}` : ''}
              </span>
            ))}
          </div>
        ) : null}
        {rawPayload ? (
          <details className="rounded-xl border bg-muted/30 p-3">
            <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-muted-foreground">
              原始载荷
            </summary>
            <pre className="mt-2 overflow-x-auto text-xs">
              {formatJson(rawPayload)}
            </pre>
          </details>
        ) : null}
      </div>
    );
  }

  if (event.type === 'plan') {
    return (
      <div className="mt-3 space-y-2">
        {event.data.entries.map((entry, index) => (
          <div
            key={`${event.eventId}-${index}`}
            className="rounded-xl border bg-muted/40 p-3"
          >
            <div className="text-sm font-medium">{entry.content}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatPriorityLabel(entry.priority)} ·{' '}
              {formatStatusLabel(entry.status)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const summary = summarizeSessionEvent(event);
  if (summary) {
    return <p className="mt-3 text-sm leading-6">{summary}</p>;
  }

  if (rawPayload) {
    return (
      <pre className="mt-3 overflow-x-auto rounded-xl border bg-muted/60 p-3 text-xs">
        {formatJson(rawPayload)}
      </pre>
    );
  }

  return null;
}

export function buildTaskSnapshot(
  history: AcpEventEnvelope[],
): TaskSnapshotItem[] {
  const plans = history.filter((event) => event.type === 'plan') as Array<
    AcpEventEnvelope & { type: 'plan'; data: AcpPlanEventData }
  >;
  const planItems = (plans.at(-1)?.data.entries ?? []).map((entry, index) => ({
    id: `plan-${index}-${entry.content}`,
    title: entry.content,
    status: entry.status,
    description: formatPriorityLabel(entry.priority),
    source: 'plan' as const,
  }));

  const toolMap = new Map<string, TaskSnapshotItem>();
  for (const event of history) {
    if (event.type !== 'tool_call' && event.type !== 'tool_result') {
      continue;
    }

    const data =
      event.type === 'tool_call'
        ? (event.data as AcpToolCallEventData)
        : (event.data as AcpToolResultEventData);
    const key =
      data.toolCallId ??
      `${event.type}:${data.title ?? data.toolName ?? event.eventId}`;
    const title = data.title ?? data.toolName ?? '工具';
    const fallbackStatus =
      event.type === 'tool_result' ? 'completed' : 'in_progress';
    const description =
      data.locations && data.locations.length > 0
        ? data.locations
            .slice(0, 2)
            .map((location) =>
              location.line
                ? `${location.path}:${location.line}`
                : location.path,
            )
            .join(' · ')
        : undefined;

    toolMap.set(key, {
      id: key,
      title,
      status: data.status ?? fallbackStatus,
      description,
      source: 'tool',
    });
  }

  if (planItems.length > 0) {
    return planItems;
  }

  return Array.from(toolMap.values());
}

export function buildSessionTree(
  sessions: State<AcpSessionSummary>[],
): SessionTreeNode[] {
  const childMap = new Map<string, State<AcpSessionSummary>[]>();
  const roots: State<AcpSessionSummary>[] = [];
  const allIds = new Set(sessions.map((session) => session.data.id));

  for (const session of sessions) {
    const parentId = session.data.parentSession?.id;
    if (!parentId || !allIds.has(parentId)) {
      roots.push(session);
      continue;
    }
    const children = childMap.get(parentId) ?? [];
    children.push(session);
    childMap.set(parentId, children);
  }

  const sortSessions = (items: State<AcpSessionSummary>[]) =>
    [...items].sort((left, right) => {
      const leftValue = Date.parse(
        left.data.lastActivityAt ??
          left.data.startedAt ??
          left.data.completedAt ??
          '',
      );
      const rightValue = Date.parse(
        right.data.lastActivityAt ??
          right.data.startedAt ??
          right.data.completedAt ??
          '',
      );
      return (
        (Number.isNaN(rightValue) ? 0 : rightValue) -
        (Number.isNaN(leftValue) ? 0 : leftValue)
      );
    });

  const hydrate = (session: State<AcpSessionSummary>): SessionTreeNode => ({
    session,
    children: sortSessions(childMap.get(session.data.id) ?? []).map(hydrate),
  });

  return sortSessions(roots).map(hydrate);
}

export function countSessionTree(node: SessionTreeNode): number {
  return (
    1 +
    node.children.reduce((count, child) => count + countSessionTree(child), 0)
  );
}

export const eventIcon = {
  tool: <WrenchIcon className="size-4 text-muted-foreground" />,
  default: <SparklesIcon className="size-4 text-muted-foreground" />,
};
