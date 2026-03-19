import type { State } from '@hateoas-ts/resource';
import { SessionTreeNode } from '@features/project-sessions';
import {
  buildSessionTree,
  countSessionTree,
  formatTimeoutScopeLabel,
  sessionDisplayName,
} from '@features/project-sessions';
import {
  AcpEventEnvelope,
  type Task,
  type TaskLaneHandoff,
  type TaskLaneSession,
  type TaskRun,
} from '@shared/schema';
import { SparklesIcon, WrenchIcon } from 'lucide-react';
import { type WorkbenchSessionRuntimeProfile } from './session-runtime-profile';

export type { SessionTreeNode };
export { buildSessionTree, countSessionTree, sessionDisplayName };

export type TaskPanelItem = {
  assignedProvider?: string | null;
  assignedRole?: string | null;
  assignedSpecialistId?: string | null;
  assignedSpecialistName?: string | null;
  boardId?: string | null;
  columnId?: string | null;
  codebaseId?: string | null;
  description?: string;
  executionSessionId?: string | null;
  id: string;
  kind?: string | null;
  laneHandoffs?: TaskLaneHandoff[];
  laneSessions?: TaskLaneSession[];
  parallelGroup?: string | null;
  parentTaskId?: string | null;
  resultSessionId?: string | null;
  source: 'plan' | 'task' | 'tool';
  status: string;
  sourceEntryIndex?: number | null;
  sourceEventId?: string | null;
  sourceType?: string | null;
  taskState?: State<Task>;
  taskId?: string;
  taskRuns?: TaskRunPanelItem[];
  title: string;
  worktreeId?: string | null;
};

export type TaskRunPanelItem = {
  completedAt: string | null;
  createdAt: string;
  delegationGroupId?: string | null;
  id: string;
  isLatest: boolean;
  kind: TaskRun['data']['kind'];
  parentTaskId?: string | null;
  provider: string | null;
  retryOfRunId: string | null;
  role: string | null;
  sessionId: string | null;
  specialistId: string | null;
  startedAt: string | null;
  status: TaskRun['data']['status'];
  summary: string | null;
  updatedAt: string;
  verificationReport: string | null;
  verificationVerdict: string | null;
  waveId?: string | null;
};

export type SidebarTab = 'sessions' | 'spec' | 'tasks';

export type WorkbenchRuntimeProfile = {
  enabledMcpServerIds: string[];
  enabledSkillIds: string[];
  orchestrationMode: 'ROUTA' | 'DEVELOPER';
  roleDefaults: WorkbenchSessionRuntimeProfile['roleDefaults'];
};

export type WorkbenchProjectInsights = {
  loading: boolean;
  noteCount: number;
  sessionNoteCount: number;
  sessionTaskRunCount: number;
  taskRunCount: number;
  runtimeProfile: WorkbenchRuntimeProfile | null;
};

export type SpecSyncState = 'clean' | 'pending_sync' | 'parse_error' | 'conflict';

export type SpecSyncSnapshot = {
  conflictCount: number;
  items: Array<{
    blockIndex: number;
    expectedTaskTitle: string;
    reason:
      | 'DUPLICATE_SOURCE_MAPPING'
      | 'FIELD_MISMATCH'
      | 'MISSING_TASK'
      | 'ORPHANED_TASK'
      | 'TASK_NOT_MUTABLE';
    taskId: string | null;
  }>;
  matchedCount: number;
  noteId: string;
  orphanedTaskCount: number;
  parseError: string | null;
  parsedCount: number;
  pendingCount: number;
  status: SpecSyncState;
  taskCount: number;
};

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
    case 'CANCELLING':
    case 'cancelling':
      return '正在取消';
    case 'WAITING_RETRY':
      return '等待重试';
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
    case 'timed_out_prompt':
      return 'Prompt 超时';
    case 'timed_out_inactive':
      return '会话空闲超时';
    case 'timed_out_total':
      return '会话总时长超时';
    case 'timed_out_step_budget':
      return '步数预算耗尽';
    case 'timed_out_provider_initialize':
      return 'Provider 初始化超时';
    case 'force_killed':
      return '已强制终止';
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

function normalizeOptionalText(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isToolEventType(event: AcpEventEnvelope): boolean {
  return (
    event.update.eventType === 'tool_call' ||
    event.update.eventType === 'tool_call_update'
  );
}

export function buildTaskPanelItem(task: State<Task>): TaskPanelItem {
  const taskData = task.data as Task['data'] & {
    sourceEntryIndex?: number | null;
    sourceEventId?: string | null;
    sourceType?: string | null;
  };
  const description =
    normalizeOptionalText(taskData.objective) ??
    normalizeOptionalText(taskData.scope);

  return {
    id: taskData.id,
    taskId: taskData.id,
    title: taskData.title,
    status: taskData.status,
    description,
    source: 'task',
    kind: taskData.kind,
    laneHandoffs: taskData.laneHandoffs,
    laneSessions: taskData.laneSessions,
    assignedRole: taskData.assignedRole,
    assignedProvider: taskData.assignedProvider,
    assignedSpecialistId: taskData.assignedSpecialistId,
    assignedSpecialistName: taskData.assignedSpecialistName,
    boardId: taskData.boardId,
    codebaseId: taskData.codebaseId,
    columnId: taskData.columnId,
    executionSessionId: taskData.executionSessionId,
    parallelGroup: taskData.parallelGroup,
    parentTaskId: taskData.parentTaskId,
    resultSessionId: taskData.resultSessionId,
    sourceEntryIndex: taskData.sourceEntryIndex,
    sourceEventId: taskData.sourceEventId,
    sourceType: taskData.sourceType,
    taskState: task,
    worktreeId: taskData.worktreeId,
  };
}

export function buildTaskRunPanelItem(run: State<TaskRun>): TaskRunPanelItem {
  return {
    completedAt: run.data.completedAt,
    createdAt: run.data.createdAt,
    delegationGroupId: run.data.delegationGroupId ?? null,
    id: run.data.id,
    isLatest: run.data.isLatest,
    kind: run.data.kind,
    parentTaskId: run.data.parentTaskId ?? null,
    provider: run.data.provider,
    retryOfRunId: run.data.retryOfRunId,
    role: run.data.role,
    sessionId: run.data.sessionId,
    specialistId: run.data.specialistId,
    startedAt: run.data.startedAt,
    status: run.data.status,
    summary: normalizeOptionalText(run.data.summary) ?? null,
    updatedAt: run.data.updatedAt,
    verificationReport:
      normalizeOptionalText(run.data.verificationReport) ?? null,
    verificationVerdict:
      normalizeOptionalText(run.data.verificationVerdict) ?? null,
    waveId: run.data.waveId ?? null,
  };
}

export function deriveTaskWaveId(item: Pick<TaskPanelItem, 'kind' | 'parallelGroup'>) {
  if (!item.parallelGroup) {
    return null;
  }

  if (item.kind === 'review' || item.kind === 'verify') {
    return `${item.parallelGroup}:gate`;
  }

  if (item.kind === 'implement' || item.kind === 'plan') {
    return `${item.parallelGroup}:implement`;
  }

  return null;
}

export function formatVerificationVerdictLabel(
  verdict: string | null | undefined,
): string {
  switch (verdict?.toLowerCase()) {
    case 'pass':
      return '通过';
    case 'fail':
      return '失败';
    case 'blocked':
      return '阻塞';
    case 'pending':
      return '待验证';
    default:
      return verdict?.trim() || '未产出';
  }
}

export function formatTaskWorkflowColumnLabel(
  columnId: string | null | undefined,
): string {
  const normalized = columnId?.trim().toLowerCase() ?? '';
  const stage = normalized.includes('_')
    ? normalized.slice(normalized.lastIndexOf('_') + 1)
    : normalized;

  switch (stage) {
    case 'backlog':
      return 'Backlog';
    case 'todo':
      return 'Todo';
    case 'dev':
      return 'Dev';
    case 'review':
      return 'Review';
    case 'blocked':
      return 'Blocked';
    case 'done':
      return 'Done';
    default:
      return columnId?.trim() || 'Unassigned';
  }
}

export function formatSpecSyncStateLabel(
  status: SpecSyncState | null | undefined,
): string {
  switch (status) {
    case 'clean':
      return '已同步';
    case 'pending_sync':
      return '待同步';
    case 'parse_error':
      return '解析错误';
    case 'conflict':
      return '存在冲突';
    default:
      return '未同步';
  }
}

export function specSyncStateChipClasses(
  status: SpecSyncState | null | undefined,
): string {
  switch (status) {
    case 'clean':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'pending_sync':
      return 'bg-sky-50 text-sky-700 ring-sky-200';
    case 'parse_error':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 'conflict':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-200';
  }
}

export function formatTaskSourceLabel(
  sourceType: string | null | undefined,
): string {
  switch (sourceType) {
    case 'spec_note':
      return 'Spec';
    case 'acp_plan':
      return 'Plan';
    case 'manual':
      return 'Manual';
    default:
      return sourceType?.trim() || '未知来源';
  }
}

export function verificationVerdictChipClasses(
  verdict: string | null | undefined,
): string {
  switch (verdict?.toLowerCase()) {
    case 'pass':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'fail':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 'blocked':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    case 'pending':
      return 'bg-sky-50 text-sky-700 ring-sky-200';
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-200';
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
  switch (event.update.eventType) {
    case 'tool_call':
    case 'tool_call_update':
      return event.update.toolCall?.status === 'completed' ? '工具结果' : '工具调用';
    case 'session_info_update':
      return '会话';
    case 'plan_update':
      return '计划';
    case 'usage_update':
      return '上下文用量';
    case 'current_mode_update':
      return '模式';
    case 'config_option_update':
      return '配置';
    case 'turn_complete':
      return '完成';
    case 'error':
      return '错误';
    case 'available_commands_update':
      return '可用命令';
    case 'lifecycle_update':
      return '生命周期';
    case 'supervision_update':
      return '监督';
    case 'agent_message':
    case 'agent_thought':
    case 'user_message':
      return '消息';
  }

  return event.update.eventType;
}

export function eventHeadline(event: AcpEventEnvelope): string {
  switch (event.update.eventType) {
    case 'tool_call':
    case 'tool_call_update':
      return event.update.toolCall?.title ?? event.update.toolCall?.kind ?? '工具调用';
    case 'plan_update':
      return `共 ${event.update.planItems?.length ?? 0} 项计划`;
    case 'usage_update':
      return `${event.update.usage?.used ?? 0}/${event.update.usage?.size ?? 0} 上下文令牌`;
    case 'session_info_update':
      return event.update.sessionInfo?.title ?? '会话信息已更新';
    case 'current_mode_update':
      return event.update.mode?.currentModeId ?? '模式已更新';
    case 'config_option_update': {
      const configOptions = event.update.configOptions;
      const count = Array.isArray(configOptions)
        ? configOptions.length
        : configOptions && typeof configOptions === 'object'
          ? Object.keys(configOptions).length
          : 0;
      return `共 ${count} 个配置项`;
    }
    case 'turn_complete':
      return event.update.turnComplete?.stopReason ?? '已完成';
    case 'error':
      return event.error?.message ?? event.update.error?.message ?? '发生错误';
    case 'available_commands_update':
      return `共 ${event.update.availableCommands?.length ?? 0} 个命令`;
    case 'lifecycle_update':
      return formatStatusLabel(event.update.lifecycle?.state ?? 'idle');
    case 'supervision_update': {
      const scopeLabel = formatTimeoutScopeLabel(event.update.supervision?.scope);
      switch (event.update.supervision?.stage) {
        case 'policy_resolved':
          return '已解析 supervision 策略';
        case 'timeout_detected':
          return scopeLabel;
        case 'cancel_requested':
          return `${scopeLabel}后请求取消`;
        case 'cancel_grace_expired':
          return '取消宽限期已过';
        case 'force_killed':
          return '已强制终止';
        default:
          return '监督事件';
      }
    }
    case 'agent_message':
    case 'agent_thought':
    case 'user_message':
      return event.update.message?.role ?? '消息';
  }

  return event.update.eventType;
}

export function summarizeSessionEvent(event: AcpEventEnvelope): string | null {
  switch (event.update.eventType) {
    case 'session_info_update': {
      const title = event.update.sessionInfo?.title;
      if (title) {
        return `会话标题已更新为 ${title}。`;
      }
      return null;
    }
    case 'turn_complete': {
      if (
        event.update.turnComplete?.state === 'CANCELLED' ||
        event.update.turnComplete?.stopReason === 'cancelled'
      ) {
        return '本次对话已取消。';
      }
      return '本轮对话已结束。';
    }
    case 'error':
      return (
        event.update.error?.message ??
        event.error?.message ??
        '执行过程中发生错误。'
      );
    case 'lifecycle_update':
      return (
        event.update.lifecycle?.detail ??
        `会话状态变为 ${formatStatusLabel(event.update.lifecycle?.state)}。`
      );
    case 'supervision_update':
      return (
        event.update.supervision?.detail ??
        (event.update.supervision?.scope
          ? `${formatTimeoutScopeLabel(event.update.supervision.scope)} supervision 已更新。`
          : '监督状态已更新。')
      );
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
    case 'WAITING_RETRY':
    case 'connecting':
    case 'CANCELLING':
    case 'cancelling':
      return 'bg-amber-500';
    case 'FAILED':
    case 'failed':
    case 'error':
    case 'CANCELLED':
    case 'cancelled':
    case 'BLOCKED':
    case 'blocked':
    case 'timed_out_prompt':
    case 'timed_out_inactive':
    case 'timed_out_total':
    case 'timed_out_step_budget':
    case 'timed_out_provider_initialize':
    case 'force_killed':
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
    case 'WAITING_RETRY':
    case 'CANCELLING':
    case 'cancelling':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    case 'FAILED':
    case 'failed':
    case 'error':
    case 'BLOCKED':
    case 'blocked':
    case 'timed_out_prompt':
    case 'timed_out_inactive':
    case 'timed_out_total':
    case 'timed_out_step_budget':
    case 'timed_out_provider_initialize':
    case 'force_killed':
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
  const rawPayload = event.update.rawNotification;

  if (isToolEventType(event)) {
    const data = event.update.toolCall;
    const primaryValue =
      data?.status === 'completed' || data?.status === 'failed'
        ? data.output ?? data.input
        : data?.input;

    return (
      <div className="mt-3 space-y-2">
        {primaryValue !== undefined ? (
          <pre className="overflow-x-auto rounded-xl border bg-muted/60 p-3 text-xs">
            {typeof primaryValue === 'string'
              ? primaryValue
              : formatJson(primaryValue)}
          </pre>
        ) : null}
        {data?.locations && data.locations.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {data.locations.map((location, index) => (
              <span
                key={`${String(location)}-${index}`}
                className="rounded-full border bg-background px-2 py-1"
              >
                {typeof location === 'object' && location !== null
                  ? JSON.stringify(location)
                  : String(location)}
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

  if (event.update.eventType === 'plan_update') {
    return (
      <div className="mt-3 space-y-2">
        {(event.update.planItems ?? []).map((entry, index) => (
          <div
            key={`${event.eventId}-${index}`}
            className="rounded-xl border bg-muted/40 p-3"
          >
            <div className="text-sm font-medium">{entry.description}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatPriorityLabel(entry.priority)} ·{' '}
              {formatStatusLabel(entry.status)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (event.update.eventType === 'supervision_update') {
    return (
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full border bg-background px-2 py-1">
            阶段 {event.update.supervision?.stage ?? 'unknown'}
          </span>
          {event.update.supervision?.scope ? (
            <span className="rounded-full border bg-background px-2 py-1">
              {formatTimeoutScopeLabel(event.update.supervision.scope)}
            </span>
          ) : null}
          {event.update.supervision?.forceKilled ? (
            <span className="rounded-full border bg-background px-2 py-1">
              force kill
            </span>
          ) : null}
        </div>
        {event.update.supervision?.detail ? (
          <p className="text-sm leading-6">{event.update.supervision.detail}</p>
        ) : null}
      </div>
    );
  }

  if (event.update.eventType === 'lifecycle_update') {
    return (
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full border bg-background px-2 py-1">
            {formatStatusLabel(event.update.lifecycle?.state)}
          </span>
          {event.update.lifecycle?.taskBound ? (
            <span className="rounded-full border bg-background px-2 py-1">
              task-bound
            </span>
          ) : null}
        </div>
        {event.update.lifecycle?.detail ? (
          <p className="text-sm leading-6">{event.update.lifecycle.detail}</p>
        ) : null}
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
): TaskPanelItem[] {
  const plans = history.filter((event) => event.update.eventType === 'plan_update');
  const planItems = (plans.at(-1)?.update.planItems ?? []).map((entry, index) => ({
    id: `plan-${index}-${entry.description ?? ''}`,
    title: entry.description ?? '',
    status: entry.status ?? 'pending',
    description: formatPriorityLabel(entry.priority),
    source: 'plan' as const,
  }));

  const toolMap = new Map<string, TaskPanelItem>();
  for (const event of history) {
    if (!isToolEventType(event)) {
      continue;
    }

    const data = event.update.toolCall;
    const key =
      data?.toolCallId ??
      `tool_call:${data?.title ?? data?.kind ?? event.eventId}`;
    const title = data?.title ?? data?.kind ?? '工具';
    const description =
      data?.locations && data.locations.length > 0
        ? data.locations
            .slice(0, 2)
            .map((location) =>
              typeof location === 'object' && location !== null
                ? JSON.stringify(location)
                : String(location),
            )
            .join(' · ')
        : undefined;

    toolMap.set(key, {
      id: key,
      title,
      status: data?.status ?? 'in_progress',
      description,
      source: 'tool',
    });
  }

  if (planItems.length > 0) {
    return planItems;
  }

  return Array.from(toolMap.values());
}

export const eventIcon = {
  tool: <WrenchIcon className="size-4 text-muted-foreground" />,
  default: <SparklesIcon className="size-4 text-muted-foreground" />,
};
