import type {
  AcpSession,
  AcpSessionData,
  AcpSessionSummary,
  AcpTimeoutScope,
} from '@shared/schema';
import type { State } from '@hateoas-ts/resource';

type SessionLike =
  | AcpSessionData
  | State<AcpSession>['data']
  | State<AcpSessionSummary>['data'];

type SessionDisplayStatus = {
  chipClassName: string;
  description: string | null;
  label: string;
  retryHint: string | null;
  toneClassName: string;
};

export function formatTimeoutScopeLabel(
  scope: AcpTimeoutScope | null | undefined,
): string {
  switch (scope) {
    case 'prompt':
      return 'Prompt 超时';
    case 'session_inactive':
      return '会话空闲超时';
    case 'session_total':
      return '会话总时长超时';
    case 'step_budget':
      return '步数预算耗尽';
    case 'provider_initialize':
      return 'Provider 初始化超时';
    case 'provider_request':
      return 'Provider 请求超时';
    case 'gateway_completion_wait':
      return '完成等待超时';
    case 'tool_execution':
      return '工具执行超时';
    case 'mcp_execution':
      return 'MCP 调用超时';
    case 'force_kill_grace':
      return '取消宽限期超时';
    default:
      return '未知超时';
  }
}

export function getSessionDisplayStatus(session: SessionLike): SessionDisplayStatus {
  if (session.state === 'CANCELLING') {
    return {
      chipClassName: 'bg-amber-50 text-amber-700 ring-amber-200',
      description: session.timeoutScope
        ? `正在处理${formatTimeoutScopeLabel(session.timeoutScope)}后的取消收敛。`
        : '正在请求取消当前会话。',
      label: '正在取消',
      retryHint: null,
      toneClassName: 'bg-amber-500',
    };
  }

  if (session.forceKilledAt) {
    return {
      chipClassName: 'bg-rose-50 text-rose-700 ring-rose-200',
      description: session.timeoutScope
        ? `${formatTimeoutScopeLabel(session.timeoutScope)}后未能在取消宽限期内结束，已强制终止。`
        : '会话未能正常结束，已强制终止。',
      label: '已强制终止',
      retryHint:
        session.timeoutScope === 'prompt' ||
        session.timeoutScope === 'provider_initialize'
          ? '建议检查 provider 状态后重新发送。'
          : '建议调整 supervision 策略或拆小任务后再重试。',
      toneClassName: 'bg-rose-500',
    };
  }

  if (session.state === 'FAILED' && session.timeoutScope) {
    const retryHint =
      session.timeoutScope === 'prompt' ||
      session.timeoutScope === 'provider_initialize' ||
      session.timeoutScope === 'gateway_completion_wait'
        ? '可直接重试当前提示。'
        : session.timeoutScope === 'session_inactive'
          ? '建议确认会话仍在活跃后再继续。'
          : '建议调整 supervision 策略或拆分任务后再重试。';

    return {
      chipClassName: 'bg-rose-50 text-rose-700 ring-rose-200',
      description:
        session.failureReason?.trim() || formatTimeoutScopeLabel(session.timeoutScope),
      label: formatTimeoutScopeLabel(session.timeoutScope),
      retryHint,
      toneClassName: 'bg-rose-500',
    };
  }

  if (session.state === 'FAILED') {
    return {
      chipClassName: 'bg-rose-50 text-rose-700 ring-rose-200',
      description: session.failureReason?.trim() || null,
      label: '失败',
      retryHint: '建议先查看错误详情，再决定是否重试。',
      toneClassName: 'bg-rose-500',
    };
  }

  if (session.state === 'CANCELLED') {
    return {
      chipClassName: 'bg-slate-100 text-slate-600 ring-slate-200',
      description: session.failureReason?.trim() || null,
      label: '已取消',
      retryHint: '可重新发送消息开始新一轮执行。',
      toneClassName: 'bg-slate-400',
    };
  }

  if (session.state === 'PENDING') {
    return {
      chipClassName: 'bg-sky-50 text-sky-700 ring-sky-200',
      description: null,
      label: session.acpStatus === 'connecting' ? '连接中' : '待处理',
      retryHint: null,
      toneClassName: session.acpStatus === 'connecting' ? 'bg-amber-500' : 'bg-sky-500',
    };
  }

  if (session.acpStatus === 'error') {
    return {
      chipClassName: 'bg-rose-50 text-rose-700 ring-rose-200',
      description: session.acpError?.trim() || session.failureReason?.trim() || null,
      label: '错误',
      retryHint: '建议先查看错误详情，再决定是否重试。',
      toneClassName: 'bg-rose-500',
    };
  }

  if (session.acpStatus === 'ready') {
    return {
      chipClassName: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      description: null,
      label: session.state === 'RUNNING' ? '就绪' : '已就绪',
      retryHint: null,
      toneClassName: 'bg-emerald-500',
    };
  }

  return {
    chipClassName: 'bg-amber-50 text-amber-700 ring-amber-200',
    description: null,
    label: '连接中',
    retryHint: null,
    toneClassName: 'bg-amber-500',
  };
}

export function formatSessionStatusLabel(session: SessionLike): string {
  return getSessionDisplayStatus(session).label;
}

export function describeSessionStatus(session: SessionLike): string | null {
  return getSessionDisplayStatus(session).description;
}

export function sessionStatusChipClasses(session: SessionLike): string {
  return getSessionDisplayStatus(session).chipClassName;
}

export function sessionStatusTone(session: SessionLike): string {
  return getSessionDisplayStatus(session).toneClassName;
}

export function sessionRetryHint(session: SessionLike): string | null {
  return getSessionDisplayStatus(session).retryHint;
}
