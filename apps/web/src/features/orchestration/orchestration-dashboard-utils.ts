export type SessionStatus =
  | 'PENDING'
  | 'PLANNING'
  | 'RUNNING'
  | 'PAUSED'
  | 'FAILED'
  | 'COMPLETED'
  | 'CANCELLED';

export type StepStatus =
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'WAITING_RETRY'
  | 'FAILED'
  | 'COMPLETED'
  | 'CANCELLED';

export type StepKind = 'PLAN' | 'IMPLEMENT' | 'VERIFY';

export interface OrchestrationArtifactView {
  content: Record<string, unknown>;
  createdAt: string;
  id: string;
  kind: string;
  sessionId: string;
  stepId: string;
  updatedAt: string;
}

export interface OrchestrationStepView {
  artifacts: OrchestrationArtifactView[];
  attempt: number;
  completedAt?: string | null;
  createdAt: string;
  dependsOn: string[];
  errorCode?: string | null;
  errorMessage?: string | null;
  id: string;
  input?: Record<string, unknown> | null;
  kind: StepKind;
  maxAttempts: number;
  output?: Record<string, unknown> | null;
  role?: string | null;
  runtimeCursor?: string | null;
  runtimeSessionId?: string | null;
  sessionId: string;
  startedAt?: string | null;
  status: StepStatus;
  title: string;
  updatedAt: string;
}

export interface OrchestrationEventView {
  at: string;
  id: string;
  payload: Record<string, unknown>;
  sessionId: string;
  stepId?: string;
  type: string;
}

export function formatTimestamp(value?: string | null) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

export function statusTone(status: SessionStatus | StepStatus) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-700';
    case 'FAILED':
    case 'CANCELLED':
      return 'bg-rose-100 text-rose-700';
    case 'RUNNING':
    case 'READY':
      return 'bg-blue-100 text-blue-700';
    case 'WAITING_RETRY':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function summarizeEvent(event: OrchestrationEventView) {
  if (event.type === 'step.runtime.event') {
    const runtimeText = resolveRuntimeEventText(event);
    if (runtimeText) {
      return runtimeText;
    }

    const gatewayType = event.payload.gatewayEvent;
    if (
      gatewayType &&
      typeof gatewayType === 'object' &&
      'type' in gatewayType &&
      typeof gatewayType.type === 'string'
    ) {
      return `gateway:${gatewayType.type}`;
    }
  }

  if (typeof event.payload.reason === 'string') {
    return event.payload.reason;
  }

  if (typeof event.payload.kind === 'string') {
    return event.payload.kind;
  }

  if (Array.isArray(event.payload.stepIds)) {
    return `${event.payload.stepIds.length} step(s)`;
  }

  return JSON.stringify(event.payload);
}

export function collectRuntimeOutputByStep(
  events: OrchestrationEventView[],
): Record<string, string[]> {
  return events.reduce<Record<string, string[]>>((accumulator, event) => {
    if (event.type !== 'step.runtime.event' || !event.stepId) {
      return accumulator;
    }

    const runtimeText = resolveRuntimeEventText(event);
    if (!runtimeText) {
      return accumulator;
    }

    if (!accumulator[event.stepId]) {
      accumulator[event.stepId] = [];
    }

    accumulator[event.stepId].push(runtimeText);
    return accumulator;
  }, {});
}

export function collectArtifactsByStep(
  steps: OrchestrationStepView[],
): Array<{
  artifact: OrchestrationArtifactView;
  stepId: string;
  stepKind: StepKind;
  stepTitle: string;
}> {
  return steps.flatMap((step) =>
    step.artifacts.map((artifact) => ({
      artifact,
      stepId: step.id,
      stepKind: step.kind,
      stepTitle: step.title,
    })),
  );
}

function resolveRuntimeEventText(event: OrchestrationEventView): string | null {
  const gatewayEvent = event.payload.gatewayEvent;
  if (!gatewayEvent || typeof gatewayEvent !== 'object') {
    return null;
  }

  const data = 'data' in gatewayEvent ? gatewayEvent.data : null;
  if (!data || typeof data !== 'object') {
    return null;
  }

  const text = 'text' in data ? data.text : null;
  return typeof text === 'string' && text.trim().length > 0 ? text : null;
}
