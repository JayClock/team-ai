import type { State } from '@hateoas-ts/resource';
import { SessionTreeNode } from '@features/project-sessions';
import {
  buildSessionTree,
  countSessionTree,
  sessionDisplayName,
} from '@features/project-sessions';
import {
  AcpEventEnvelope,
  type AcpSession,
  type Task,
  type TaskRun,
} from '@shared/schema';
import { SparklesIcon, WrenchIcon } from 'lucide-react';
import type { WorkbenchSessionRuntimeProfile } from './session-runtime-profile';

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

function normalizeProviderId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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

export function formatOrchestrationModeLabel(
  mode: WorkbenchSessionRuntimeProfile['orchestrationMode'] | null | undefined,
): string {
  switch (mode) {
    case 'DEVELOPER':
      return 'DEVELOPER 单人';
    case 'ROUTA':
      return 'ROUTA 多 Agent';
    default:
      return '未加载模式';
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
  switch (columnId) {
    case 'backlog':
      return 'Backlog';
    case 'todo':
      return 'Todo';
    case 'dev':
      return 'In Progress';
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
  runtimeProfile?: WorkbenchSessionRuntimeProfile | null;
  selectedSession: State<AcpSession> | null;
  streamStatus: string;
  taskItems: TaskPanelItem[];
}): WorkbenchWalkthroughScenario[] {
  const { events, runtimeProfile, selectedSession, streamStatus, taskItems } =
    input;
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
  const failureTaskCount = taskSourceItems.filter((item) =>
    taskFailureStatuses.has(item.status),
  ).length;
  const failureRunCount = allRuns.filter((run) =>
    taskRunFailureStatuses.has(run.status),
  ).length;
  const errorEvents = events.filter((event) => event.update.eventType === 'error');
  const hasSessionFailure = Boolean(
    selectedSession?.data.failureReason?.trim(),
  );
  const effectiveMode: WorkbenchSessionRuntimeProfile['orchestrationMode'] =
    runtimeProfile?.orchestrationMode ??
    (selectedSession?.data.specialistId === 'solo-developer'
      ? 'DEVELOPER'
      : 'ROUTA');
  const observedProviders = Array.from(
    new Set(
      [
        normalizeProviderId(runtimeProfile?.defaultProviderId),
        normalizeProviderId(selectedSession?.data.provider),
        ...taskSourceItems.map((item) =>
          normalizeProviderId(item.assignedProvider),
        ),
        ...allRuns.map((run) => normalizeProviderId(run.provider)),
      ].filter((provider): provider is string => Boolean(provider)),
    ),
  );
  const goalToReviewCovered =
    selectedSession?.data.specialistId !== 'solo-developer' &&
    dispatchLinkedTasks.length > 0 &&
    allRuns.length > 0 &&
    (reviewOrVerifyTasks.length > 0 || reviewOrVerifyRuns.length > 0);
  const goalToReviewStatus: WorkbenchWalkthroughStatus = goalToReviewCovered
    ? 'covered'
    : 'ready';
  const failureRetryCovered = retriedRuns.length > 0;
  const failureRetryStatus: WorkbenchWalkthroughStatus = failureRetryCovered
    ? 'covered'
    : selectedSession ||
        allRuns.length > 0 ||
        retryReady ||
        streamStatus === 'error' ||
        hasSessionFailure ||
        errorEvents.length > 0 ||
        failureTaskCount > 0 ||
        failureRunCount > 0
      ? 'ready'
      : 'pending';
  const developerSingleModeCovered =
    effectiveMode === 'DEVELOPER' &&
    selectedSession?.data.specialistId === 'solo-developer';
  const developerSingleModeStatus: WorkbenchWalkthroughStatus =
    developerSingleModeCovered
      ? 'covered'
      : runtimeProfile
        ? 'ready'
        : 'pending';
  const providerSwitchCovered = observedProviders.length > 1;
  const providerSwitchStatus: WorkbenchWalkthroughStatus = providerSwitchCovered
    ? 'covered'
    : observedProviders.length > 0
      ? 'ready'
      : 'pending';
  const modeLabel = formatOrchestrationModeLabel(effectiveMode);
  const defaultProviderLabel =
    normalizeProviderId(runtimeProfile?.defaultProviderId) ??
    '未配置默认 provider';
  const currentProviderLabel =
    normalizeProviderId(selectedSession?.data.provider) ?? '未选择 provider';

  return [
    {
      id: 'goal-plan-review',
      title: '输入目标到 Review 闭环',
      summary:
        '从输入目标开始，一次讲清 plan、task、child session、task run 与 review/verify 的完整联动。',
      status: goalToReviewStatus,
      liveNote: goalToReviewCovered
        ? `已观察到 ${dispatchLinkedTasks.length} 个带执行链路的任务、${allRuns.length} 条 run，以及 ${reviewOrVerifyTasks.length + reviewOrVerifyRuns.length} 个 review/verify 节点，可直接按闭环演示。`
        : selectedSession
          ? '当前已有根会话；请显式创建 task，再通过执行或委派演示 ROUTA 编排链路。'
          : '当前还没有会话，请先点击右上角“新建会话”，再配合显式 task 创建演示编排流程。',
      steps: [
        '创建或打开一个项目，点击“新建会话”，输入交付目标以建立上下文。',
        '在 Tasks 面板显式创建 task，并补充角色、范围或验收要求。',
        '执行或委派 task，确认 child session 与 task 卡片挂接 executionSessionId / resultSessionId。',
        '展开 Task Runs，确认 run 时间线、结果摘要，以及 review/verify 的结论展示。',
      ],
      expectedSignals: [
        'Task 卡片显示 executionSessionId、resultSessionId 与“打开会话”入口。',
        'Session Tree 能区分根会话、子会话、specialist 与 taskId。',
        'Task Runs 展示最新执行、历史执行，以及 review/verify 的 summary、verdict、report。',
        '从任务跳转到执行会话后，Activity 与任务状态保持一致。',
      ],
    },
    {
      id: 'failure-retry',
      title: '失败恢复与 Retry',
      summary:
        '故意制造一次失败，再验证错误提示、等待重试状态与 retry run 是否形成闭环。',
      status: failureRetryStatus,
      liveNote: failureRetryCovered
        ? `已检测到 ${retriedRuns.length} 条 retry run，可直接检查 retryOfRunId 与历史执行保留情况。`
        : streamStatus === 'error' ||
            hasSessionFailure ||
            errorEvents.length > 0 ||
            failureTaskCount > 0 ||
            failureRunCount > 0 ||
            retryReady
          ? '当前已经有失败样本，可直接点击“重试”并继续演示恢复路径。'
          : allRuns.length > 0
            ? `当前已有 ${allRuns.length} 条 run 记录；可临时停掉 provider、制造命令失败或取消执行，再继续演示 retry。`
            : selectedSession
              ? '当前已有会话，可先推动一次任务执行，再补充失败与恢复演示。'
              : '请先完成至少一次会话与任务执行，再进入失败恢复演示。',
      steps: [
        '临时停掉 provider、制造执行错误，或手动取消正在运行的任务。',
        '确认 Activity、任务状态与 Task Runs 同时出现失败或取消信号。',
        '对失败、取消或等待重试的任务点击“重试”，确认生成新的 latest run。',
      ],
      expectedSignals: [
        'Task 或 Task Run 进入 FAILED、CANCELLED 或 WAITING_RETRY 状态。',
        '按钮区出现可用的“重试”动作，且失败摘要仍然可见。',
        '重试后出现新的 latest run，旧 run 进入历史执行，且保留 retryOfRunId。',
      ],
    },
    {
      id: 'developer-single-mode',
      title: 'DEVELOPER 单人模式',
      summary:
        '切换到 DEVELOPER 模式后，验证根会话使用 solo-developer，并且不再自动扩散出 child session。',
      status: developerSingleModeStatus,
      liveNote: developerSingleModeCovered
        ? `当前模式已进入 ${modeLabel}，所选会话使用 solo-developer，可直接说明单人模式路径。`
        : runtimeProfile
          ? `当前模式为 ${modeLabel}；切换 Runtime Profile 为 DEVELOPER 后，新建根会话即可演示单人模式。`
          : '当前还没有加载到 Runtime Profile，请先确认项目可以读取默认 provider 与 orchestration mode。',
      steps: [
        '将 Runtime Profile 的 orchestration mode 切换为 DEVELOPER。',
        '新建一个根会话，输入一个边界清晰的实现目标。',
        '确认 Session Tree 中当前根会话的 specialist 为 solo-developer，且不会继续自动分发 child session。',
      ],
      expectedSignals: [
        '验收面板顶部的模式标识切换为 DEVELOPER 单人。',
        '根会话显示 solo-developer specialist，而不是 routa-coordinator。',
        '当前会话可以直接完成交付，不依赖 task 自动分发或 child session 树展开。',
      ],
    },
    {
      id: 'provider-switch',
      title: 'Provider 切换演示',
      summary:
        '切换默认 provider 后，验证新旧 provider 在会话、任务与 run 上都能被清晰区分。',
      status: providerSwitchStatus,
      liveNote: providerSwitchCovered
        ? `已观察到多个 provider：${observedProviders.join(' -> ')}，可直接演示切换前后的差异。`
        : observedProviders.length > 0
          ? `当前默认 provider 为 ${defaultProviderLabel}，当前会话 provider 为 ${currentProviderLabel}；切换后新建会话或重试任务即可补齐演示。`
          : '当前还没有识别到 provider，请先确认 Runtime Profile 或现有会话已经配置 provider。',
      steps: [
        '先用一个默认 provider 创建会话或执行任务，记录当前 provider 标识。',
        '切换 Runtime Profile 的 defaultProviderId，再新建会话或重试任务。',
        '对比切换前后的会话、任务卡片与 Task Runs，确认 provider 变化清晰可见。',
      ],
      expectedSignals: [
        '验收面板顶部显示默认 provider，当前会话或 run 显示实际执行 provider。',
        '切换后创建的新会话或新 run 会带上新的 provider 标识。',
        '历史会话、任务与 run 仍保留旧 provider，便于前后台对照演示。',
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
