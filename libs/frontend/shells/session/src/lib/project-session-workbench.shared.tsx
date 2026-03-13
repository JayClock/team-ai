import type { State } from '@hateoas-ts/resource';
import { SessionTreeNode } from '@features/project-sessions';
import {
  buildSessionTree,
  countSessionTree,
  sessionDisplayName,
} from '@features/project-sessions';
import {
  AcpEventEnvelope,
  type AcpCompleteEventData,
  type AcpErrorEventData,
  type AcpPlanEventData,
  type AcpSession,
  type AcpSessionEventData,
  type Task,
  type TaskRun,
  type AcpToolCallEventData,
  type AcpToolResultEventData,
} from '@shared/schema';
import { SparklesIcon, WrenchIcon } from 'lucide-react';

export type { SessionTreeNode };
export { buildSessionTree, countSessionTree, sessionDisplayName };

export type TaskPanelItem = {
  assignedProvider?: string | null;
  assignedRole?: string | null;
  description?: string;
  executionSessionId?: string | null;
  id: string;
  kind?: string | null;
  resultSessionId?: string | null;
  source: 'plan' | 'task' | 'tool';
  status: string;
  taskState?: State<Task>;
  taskId?: string;
  taskRuns?: TaskRunPanelItem[];
  title: string;
};

export type TaskRunPanelItem = {
  completedAt: string | null;
  createdAt: string;
  id: string;
  isLatest: boolean;
  kind: TaskRun['data']['kind'];
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
};

export type TaskPanelAction = 'execute' | 'review' | 'retry';

export type TaskPrimaryAction = {
  action: Exclude<TaskPanelAction, 'retry'>;
  enabled: boolean;
  label: string;
  pendingLabel: string;
};

const taskPrimaryActionStatuses = new Set(['PENDING', 'READY']);
const taskRetryStatuses = new Set(['FAILED', 'CANCELLED', 'WAITING_RETRY']);
const taskFailureStatuses = new Set(['FAILED', 'CANCELLED', 'WAITING_RETRY']);
const taskRunFailureStatuses = new Set(['FAILED', 'CANCELLED']);

export type WorkbenchWalkthroughStatus = 'pending' | 'ready' | 'covered';

export type WorkbenchWalkthroughScenario = {
  expectedSignals: string[];
  id: string;
  liveNote: string;
  status: WorkbenchWalkthroughStatus;
  steps: string[];
  summary: string;
  title: string;
};

export type SidebarTab = 'sessions' | 'spec' | 'tasks';

export type WorkbenchRuntimeProfile = {
  defaultModel: string | null;
  defaultProviderId: string | null;
  enabledMcpServerIds: string[];
  enabledSkillIds: string[];
  orchestrationMode: 'ROUTA' | 'DEVELOPER';
};

export type WorkbenchProjectInsights = {
  loading: boolean;
  noteCount: number;
  sessionNoteCount: number;
  sessionTaskRunCount: number;
  taskRunCount: number;
  runtimeProfile: WorkbenchRuntimeProfile | null;
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

export function buildTaskPanelItem(task: State<Task>): TaskPanelItem {
  const description =
    normalizeOptionalText(task.data.objective) ??
    normalizeOptionalText(task.data.scope);

  return {
    id: task.data.id,
    taskId: task.data.id,
    title: task.data.title,
    status: task.data.status,
    description,
    source: 'task',
    kind: task.data.kind,
    assignedRole: task.data.assignedRole,
    assignedProvider: task.data.assignedProvider,
    executionSessionId: task.data.executionSessionId,
    resultSessionId: task.data.resultSessionId,
    taskState: task,
  };
}

export function buildTaskRunPanelItem(run: State<TaskRun>): TaskRunPanelItem {
  return {
    completedAt: run.data.completedAt,
    createdAt: run.data.createdAt,
    id: run.data.id,
    isLatest: run.data.isLatest,
    kind: run.data.kind,
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
  };
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

function isDispatchableTaskKind(
  kind: TaskPanelItem['kind'],
): kind is 'implement' | 'review' | 'verify' {
  return kind === 'implement' || kind === 'review' || kind === 'verify';
}

function canRunPrimaryTaskAction(item: TaskPanelItem): boolean {
  return (
    item.source === 'task' &&
    Boolean(item.taskState) &&
    !item.executionSessionId &&
    taskPrimaryActionStatuses.has(item.status)
  );
}

export function getTaskPrimaryAction(
  item: TaskPanelItem,
): TaskPrimaryAction | null {
  if (!isDispatchableTaskKind(item.kind)) {
    return null;
  }

  const enabled = canRunPrimaryTaskAction(item);

  switch (item.kind) {
    case 'implement':
      return {
        action: 'execute',
        enabled,
        label: '开始执行',
        pendingLabel: '启动中...',
      };
    case 'review':
      return {
        action: 'review',
        enabled,
        label: '开始复核',
        pendingLabel: '复核中...',
      };
    case 'verify':
      return {
        action: 'review',
        enabled,
        label: '开始验证',
        pendingLabel: '验证中...',
      };
  }
}

export function canRetryTask(item: TaskPanelItem): boolean {
  return (
    item.source === 'task' &&
    Boolean(item.taskState) &&
    isDispatchableTaskKind(item.kind) &&
    !item.executionSessionId &&
    taskRetryStatuses.has(item.status)
  );
}

export function describeTaskExecutionStatus(
  item: TaskPanelItem,
  currentSessionId?: string,
): string | null {
  if (item.source !== 'task') {
    return null;
  }

  if (item.executionSessionId && item.executionSessionId === currentSessionId) {
    return '当前会话正在执行该任务';
  }

  if (item.resultSessionId) {
    switch (item.status) {
      case 'COMPLETED':
        return '执行结果已回写';
      case 'FAILED':
        return '已回写失败结果';
      case 'CANCELLED':
        return '已回写取消结果';
      default:
        return '结果会话已关联';
    }
  }

  if (item.executionSessionId) {
    return item.status === 'RUNNING' ? '执行会话进行中' : '已分发执行会话';
  }

  switch (item.status) {
    case 'READY':
      return '等待自动分发';
    case 'PENDING':
      return '尚未进入执行';
    case 'BLOCKED':
      return '等待依赖解锁';
    case 'WAITING_RETRY':
      return '等待手动重试';
    case 'RUNNING':
      return '执行状态已启动';
    default:
      return '等待执行状态更新';
  }
}

export function formatWalkthroughStatusLabel(
  status: WorkbenchWalkthroughStatus,
): string {
  switch (status) {
    case 'covered':
      return '已覆盖';
    case 'ready':
      return '可走查';
    default:
      return '待触发';
  }
}

export function walkthroughStatusChipClasses(
  status: WorkbenchWalkthroughStatus,
): string {
  switch (status) {
    case 'covered':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'ready':
      return 'bg-sky-50 text-sky-700 ring-sky-200';
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-200';
  }
}

export function buildWorkbenchWalkthroughScenarios(input: {
  events: AcpEventEnvelope[];
  selectedSession: State<AcpSession> | null;
  streamStatus: string;
  taskItems: TaskPanelItem[];
}): WorkbenchWalkthroughScenario[] {
  const { events, selectedSession, streamStatus, taskItems } = input;
  const taskSourceItems = taskItems.filter((item) => item.source === 'task');
  const allRuns = taskSourceItems.flatMap((item) => item.taskRuns ?? []);
  const reviewOrVerifyTasks = taskSourceItems.filter(
    (item) => item.kind === 'review' || item.kind === 'verify',
  );
  const reviewOrVerifyRuns = allRuns.filter(
    (run) => run.kind === 'review' || run.kind === 'verify',
  );
  const dispatchLinkedTasks = taskSourceItems.filter(
    (item) => item.executionSessionId || item.resultSessionId,
  );
  const retriedRuns = allRuns.filter((run) => Boolean(run.retryOfRunId));
  const retryReady = taskSourceItems.some((item) => canRetryTask(item));
  const verificationEvidence = reviewOrVerifyRuns.filter(
    (run) => run.summary || run.verificationReport || run.verificationVerdict,
  );
  const failureTaskCount = taskSourceItems.filter((item) =>
    taskFailureStatuses.has(item.status),
  ).length;
  const failureRunCount = allRuns.filter((run) =>
    taskRunFailureStatuses.has(run.status),
  ).length;
  const errorEvents = events.filter((event) => event.type === 'error');
  const hasSessionFailure = Boolean(
    selectedSession?.data.failureReason?.trim(),
  );

  const projectStartStatus: WorkbenchWalkthroughStatus = selectedSession
    ? 'covered'
    : 'ready';
  const autoDispatchStatus: WorkbenchWalkthroughStatus =
    dispatchLinkedTasks.length > 0
      ? 'covered'
      : taskSourceItems.length > 0
        ? 'ready'
        : 'pending';
  const runAndRetryStatus: WorkbenchWalkthroughStatus =
    retriedRuns.length > 0
      ? 'covered'
      : allRuns.length > 0 || retryReady
        ? 'ready'
        : 'pending';
  const reviewAndVerifyStatus: WorkbenchWalkthroughStatus =
    verificationEvidence.length > 0
      ? 'covered'
      : reviewOrVerifyTasks.length > 0 || reviewOrVerifyRuns.length > 0
        ? 'ready'
        : 'pending';
  const failurePathStatus: WorkbenchWalkthroughStatus =
    streamStatus === 'error' ||
    hasSessionFailure ||
    errorEvents.length > 0 ||
    failureTaskCount > 0 ||
    failureRunCount > 0
      ? 'covered'
      : selectedSession
        ? 'ready'
        : 'pending';

  return [
    {
      id: 'project-session-start',
      title: '项目创建与 Session 启动',
      summary: '确认新项目进入 workbench 后，能创建根会话并开始第一轮对话。',
      status: projectStartStatus,
      liveNote: selectedSession
        ? `当前已选中 ${sessionDisplayName(selectedSession)}，可以直接继续后续走查。`
        : '当前还没有选中会话，请先点击右上角“新建会话”。',
      steps: [
        '从项目列表创建或打开一个项目，进入 workbench。',
        '点击右上角“新建会话”，确认左侧 Session Tree 出现新的根会话。',
        '在输入框发送第一条需求，观察顶部状态、消息流与活动记录开始刷新。',
      ],
      expectedSignals: [
        'Header 显示项目名、当前 provider 与会话标题。',
        '左侧 Session Tree 出现根会话，且状态 chip 可见。',
        '会话开始响应后，Activity 中出现 session/message/status 事件。',
      ],
    },
    {
      id: 'task-auto-dispatch',
      title: 'Task 自动分发显示',
      summary:
        '确认 ROUTA 生成 plan 后，任务卡片、执行会话与 Session Tree 映射清晰可见。',
      status: autoDispatchStatus,
      liveNote:
        dispatchLinkedTasks.length > 0
          ? `已检测到 ${dispatchLinkedTasks.length} 个任务带执行链路，可直接核对 executionSessionId / resultSessionId。`
          : taskSourceItems.length > 0
            ? `当前已有 ${taskSourceItems.length} 个任务，请继续观察任务是否自动挂接执行会话。`
            : '当前还没有同步到任务，请先让 ROUTA 输出 plan 并等待 task 创建。',
      steps: [
        '向 coordinator 发送一个需要拆解的目标，等待 plan 与 task 自动生成。',
        '打开 Tasks 面板，确认任务卡片出现 kind、role、provider 与当前执行状态。',
        '对照左侧 Session Tree，确认 child session 会随着任务分发出现，并可回到任务上下文。',
      ],
      expectedSignals: [
        'Task 卡片显示 executionSessionId、resultSessionId 与“打开会话”入口。',
        'Session Tree 能区分根会话、子会话、specialist 与 taskId。',
        '任务已分发时，“当前执行状态”会体现等待、进行中或结果回写状态。',
      ],
    },
    {
      id: 'run-and-retry',
      title: 'Run 展示与 Retry',
      summary:
        '确认 task run 时间线、最新/历史执行切换，以及 retry 语义能被完整观察。',
      status: runAndRetryStatus,
      liveNote:
        retriedRuns.length > 0
          ? `已检测到 ${retriedRuns.length} 条 retry run，可检查 retryOfRunId 与历史记录展开区。`
          : allRuns.length > 0
            ? `当前已有 ${allRuns.length} 条 run 记录；若要覆盖 retry，可对失败或取消的任务点击“重试”。`
            : '当前还没有 run 记录，请先执行任务或等待自动分发完成。',
      steps: [
        '选择一个已有执行历史的任务，展开 Task Runs 卡片。',
        '确认最新执行展示在顶部，历史执行可在折叠区展开查看。',
        '对失败、取消或等待重试的任务点击“重试”，确认新增 run 且旧 run 不被覆盖。',
      ],
      expectedSignals: [
        'Task Runs 显示创建、开始、完成/失败/取消等生命周期时间点。',
        '重试后出现新的 latest run，旧 run 进入历史执行，且保留 retryOfRunId。',
        '失败或取消后的任务在按钮区显示“重试”可用。',
      ],
    },
    {
      id: 'review-and-verify',
      title: 'Review / Verify 展示',
      summary:
        '确认 review、verify 任务的按钮文案、执行结果与验证结论展示完整。',
      status: reviewAndVerifyStatus,
      liveNote:
        verificationEvidence.length > 0
          ? `已检测到 ${verificationEvidence.length} 条 review/verify 结果，可核对 summary、verdict 与 report。`
          : reviewOrVerifyTasks.length > 0
            ? `当前已有 ${reviewOrVerifyTasks.length} 个 review/verify 任务，可通过“开始复核”或“开始验证”继续走查。`
            : '当前还没有 review/verify 任务，请先完成实现任务并触发下游复核。',
      steps: [
        '等待或创建 review / verify 任务，观察按钮文案是否分别显示为“开始复核”或“开始验证”。',
        '执行对应任务后，检查 Task Runs 中的结果摘要、验证结论与验证报告。',
        '通过 executionSessionId / resultSessionId 跳转到会话，确认 review 输出与任务卡片保持一致。',
      ],
      expectedSignals: [
        'review 与 verify 任务使用不同按钮文案，但共享一致的执行入口。',
        'Run 卡片展示 verdict chip、summary 与 verification report。',
        '结果会话与任务卡片中的结论字段保持同步。',
      ],
    },
    {
      id: 'provider-failure-path',
      title: 'Provider 不可用与失败路径 UI',
      summary:
        '确认 provider 中断、执行失败或取消后，用户能在 workbench 中定位失败原因与补救动作。',
      status: failurePathStatus,
      liveNote:
        streamStatus === 'error'
          ? '当前流式连接已经进入错误状态，可直接检查 Activity 与任务失败展示。'
          : hasSessionFailure
            ? `当前会话记录了失败原因：${selectedSession?.data.failureReason}`
            : errorEvents.length > 0 ||
                failureTaskCount > 0 ||
                failureRunCount > 0
              ? `已检测到 ${errorEvents.length} 条错误事件、${failureTaskCount} 个失败任务、${failureRunCount} 条失败 run，可直接检查失败 UI。`
              : '当前还没有失败样本；可临时停掉 provider、制造命令失败或取消会话来走查错误路径。',
      steps: [
        '模拟 provider 不可用、运行命令失败，或手动取消正在执行的会话。',
        '打开 Activity 与 Tasks 面板，确认错误事件、失败 run、等待重试状态能被同时看到。',
        '验证用户仍能通过失败摘要、错误提示与“重试”按钮继续下一步操作。',
      ],
      expectedSignals: [
        '顶部流状态、Activity 错误事件与任务/运行失败状态保持一致。',
        'Task Runs 中会显示 FAILED 或 CANCELLED，并保留摘要或报告。',
        '失败任务会进入可恢复状态，例如“等待重试”或展示可用的 retry 按钮。',
      ],
    },
  ];
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
    case 'WAITING_RETRY':
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
    case 'WAITING_RETRY':
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
): TaskPanelItem[] {
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

  const toolMap = new Map<string, TaskPanelItem>();
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

export const eventIcon = {
  tool: <WrenchIcon className="size-4 text-muted-foreground" />,
  default: <SparklesIcon className="size-4 text-muted-foreground" />,
};
