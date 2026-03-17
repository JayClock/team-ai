import { State } from '@hateoas-ts/resource';
import { Project } from '@shared/schema';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@shared/ui';
import { runtimeFetch } from '@shared/util-http';
import { projectTitle, useProjectSelection } from '@shells/sessions';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

interface OrchestrationSnapshot {
  artifactGates: {
    blockedTaskCount: number;
    blockedTasks: Array<{
      columnId: string | null;
      id: string;
      lastSyncError: string | null;
      latestLaneHandoff: {
        fromSessionId: string;
        id: string;
        requestType: string;
        respondedAt: string | null;
        responseSummary: string | null;
        status: string;
        toSessionId: string;
      } | null;
      latestLaneSession: {
        columnId: string | null;
        role: string | null;
        sessionId: string;
        specialistId: string | null;
        startedAt: string;
        status: string;
      } | null;
      title: string;
      triggerSessionId: string | null;
      verificationVerdict: string | null;
    }>;
  };
  backgroundWorker: {
    readyTaskCount: number;
    readyTaskIds: string[];
    readyTasks: Array<{
      id: string;
      projectId: string;
      status: string;
      taskId: string | null;
      title: string;
      triggerSource: string | null;
    }>;
    running: boolean;
    runningTaskCount: number;
    runningTaskIds: string[];
    runningTasks: Array<{
      id: string;
      projectId: string;
      resultSessionId: string | null;
      startedAt: string | null;
      status: string;
      taskId: string | null;
      title: string;
      triggerSource: string | null;
    }>;
  };
  kanban: {
    activeAutomationCount: number;
    activeAutomations: Array<{
      autoAdvanceOnSuccess: boolean;
      boardId: string;
      columnId: string;
      projectId: string;
      sessionId: string | null;
      taskId: string;
      taskTitle: string;
      triggerSessionId: string | null;
    }>;
    queuedAutomationCount: number;
    queuedAutomations: Array<{
      autoAdvanceOnSuccess: boolean;
      boardId: string;
      columnId: string;
      enqueuedAt: string;
      projectId: string;
      taskId: string;
      taskTitle: string;
    }>;
  };
  traces: {
    byEventType: Record<string, number>;
    recentOrchestrationTraces: Array<{
      createdAt: string;
      eventName: string | null;
      id: string;
      sessionId: string;
      summary: string;
    }>;
    totalCount: number;
    uniqueSessions: number;
  };
  workflows: {
    runningRunCount: number;
    runningRuns: Array<{
      completedSteps: number;
      currentStepName: string | null;
      failedSteps: number;
      id: string;
      pendingSteps: number;
      runningSteps: number;
      status: string;
      totalSteps: number;
      updatedAt: string;
      workflowId: string;
      workflowName: string;
      workflowVersion: number;
    }>;
  };
}

interface WorkflowDefinitionList {
  _embedded?: {
    workflows?: WorkflowDefinitionSummary[];
  };
}

interface WorkflowDefinitionSummary {
  id: string;
  name: string;
  description: string | null;
  version: number;
  steps: Array<{
    name: string;
    parallelGroup: string | null;
    specialistId: string;
  }>;
}

interface ScheduleList {
  _embedded?: {
    schedules?: ScheduleSummary[];
  };
}

interface ScheduleSummary {
  cronExpr: string;
  enabled: boolean;
  id: string;
  lastRunAt: string | null;
  lastWorkflowRunId: string | null;
  name: string;
  nextRunAt: string | null;
  workflowId: string;
}

interface WebhookConfigList {
  _embedded?: {
    webhookConfigs?: WebhookConfigSummary[];
  };
}

interface WebhookConfigSummary {
  enabled: boolean;
  eventTypes: string[];
  id: string;
  name: string;
  repo: string;
  webhookSecretConfigured: boolean;
  workflowId: string;
}

interface WebhookLogList {
  _embedded?: {
    webhookLogs?: WebhookLogSummary[];
  };
}

interface WebhookLogSummary {
  configId: string;
  createdAt: string;
  errorMessage: string | null;
  eventAction: string | null;
  eventType: string;
  id: string;
  outcome: 'error' | 'skipped' | 'triggered';
  signatureValid: boolean;
  workflowRunId: string | null;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatWebhookLogMeta(log: WebhookLogSummary) {
  const execution = log.workflowRunId
    ? log.workflowRunId
    : log.signatureValid
      ? 'no workflow run'
      : 'invalid signature';

  return `${log.configId} · ${formatDateTime(log.createdAt)} · ${execution}${
    log.errorMessage ? ` · ${log.errorMessage}` : ''
  }`;
}

function artifactGateSessionLink(projectId: string, task: OrchestrationSnapshot['artifactGates']['blockedTasks'][number]) {
  const sessionId =
    task.triggerSessionId ?? task.latestLaneSession?.sessionId ?? task.latestLaneHandoff?.fromSessionId;
  if (!sessionId) {
    return null;
  }

  return `/projects/${projectId}/sessions/${sessionId}`;
}

export default function ProjectOrchestrationPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { projects, selectedProject } = useProjectSelection();
  const projectState = selectedProject as State<Project> | undefined;
  const currentProjectId = projectState?.data.id;
  const [snapshot, setSnapshot] = useState<OrchestrationSnapshot | null>(null);
  const [workflowDefinitions, setWorkflowDefinitions] = useState<
    WorkflowDefinitionSummary[]
  >([]);
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([]);
  const [webhookConfigs, setWebhookConfigs] = useState<WebhookConfigSummary[]>(
    [],
  );
  const [webhookLogs, setWebhookLogs] = useState<WebhookLogSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<
    'process' | 'refresh' | 'tickSchedules' | null
  >(null);

  const loadData = useCallback(async () => {
    if (!projectId) {
      return;
    }

    setLoading(true);

    try {
      const [
        snapshotResponse,
        workflowsResponse,
        schedulesResponse,
        webhookConfigsResponse,
        webhookLogsResponse,
      ] = await Promise.all([
        runtimeFetch(`/api/background-tasks/status?projectId=${projectId}`),
        runtimeFetch(`/api/projects/${projectId}/workflows`),
        runtimeFetch(`/api/projects/${projectId}/schedules`),
        runtimeFetch(`/api/webhooks/configs?projectId=${projectId}`),
        runtimeFetch(`/api/webhooks/webhook-logs?projectId=${projectId}&limit=20`),
      ]);

      if (!snapshotResponse.ok) {
        throw new Error('加载 orchestration snapshot 失败');
      }
      if (!workflowsResponse.ok) {
        throw new Error('加载 workflows 失败');
      }
      if (!schedulesResponse.ok) {
        throw new Error('加载 schedules 失败');
      }
      if (!webhookConfigsResponse.ok) {
        throw new Error('加载 webhook configs 失败');
      }
      if (!webhookLogsResponse.ok) {
        throw new Error('加载 webhook logs 失败');
      }

      const snapshotPayload = (await snapshotResponse.json()) as OrchestrationSnapshot;
      const workflowsPayload = (await workflowsResponse.json()) as WorkflowDefinitionList;
      const schedulesPayload = (await schedulesResponse.json()) as ScheduleList;
      const webhookConfigsPayload =
        (await webhookConfigsResponse.json()) as WebhookConfigList;
      const webhookLogsPayload = (await webhookLogsResponse.json()) as WebhookLogList;

      setSnapshot(snapshotPayload);
      setWorkflowDefinitions(workflowsPayload._embedded?.workflows ?? []);
      setSchedules(schedulesPayload._embedded?.schedules ?? []);
      setWebhookConfigs(webhookConfigsPayload._embedded?.webhookConfigs ?? []);
      setWebhookLogs(webhookLogsPayload._embedded?.webhookLogs ?? []);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleProcessQueue = useCallback(async () => {
    setPendingAction('process');
    try {
      const response = await runtimeFetch('/api/background-tasks/process', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('处理队列失败');
      }
      await loadData();
    } finally {
      setPendingAction(null);
    }
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setPendingAction('refresh');
    try {
      await loadData();
    } finally {
      setPendingAction(null);
    }
  }, [loadData]);

  const handleTickSchedules = useCallback(async () => {
    setPendingAction('tickSchedules');
    try {
      const response = await runtimeFetch('/api/schedules/tick', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('触发 schedules tick 失败');
      }
      await loadData();
    } finally {
      setPendingAction(null);
    }
  }, [loadData]);

  if (projects.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-4xl">
          <CardHeader>
            <CardTitle>Orchestration</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            当前还没有本地项目。
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!projectId || !projectState || currentProjectId !== projectId) {
    return null;
  }

  return (
    <div className="min-h-[100dvh] bg-background p-4 md:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Project Orchestration
            </div>
            <h1 className="mt-1 text-2xl font-semibold">
              {projectTitle(projectState)}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              项目级 queue、workflow、trace、schedule 与 webhook 运行态总览。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/">返回项目</Link>
            </Button>
            <Button variant="outline" onClick={() => navigate(-1)}>
              返回上一页
            </Button>
            <Button
              variant="outline"
              disabled={pendingAction === 'process' || pendingAction === 'tickSchedules'}
              onClick={() => void handleRefresh()}
            >
              {pendingAction === 'refresh' ? '刷新中...' : '刷新'}
            </Button>
            <Button
              variant="outline"
              disabled={pendingAction === 'process' || pendingAction === 'refresh'}
              onClick={() => void handleTickSchedules()}
            >
              {pendingAction === 'tickSchedules' ? 'Tick 中...' : 'Tick Schedules'}
            </Button>
            <Button
              disabled={pendingAction === 'refresh' || pendingAction === 'tickSchedules'}
              onClick={() => void handleProcessQueue()}
            >
              {pendingAction === 'process' ? '处理中...' : '处理队列'}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <SummaryCard
            label="Worker"
            value={
              loading
                ? '加载中'
                : snapshot?.backgroundWorker.running
                  ? `${snapshot.backgroundWorker.runningTaskCount} running`
                  : 'stopped'
            }
            meta={`${snapshot?.backgroundWorker.readyTaskCount ?? 0} ready`}
          />
          <SummaryCard
            label="Kanban"
            value={`${snapshot?.kanban.activeAutomationCount ?? 0} active`}
            meta={`${snapshot?.kanban.queuedAutomationCount ?? 0} queued`}
          />
          <SummaryCard
            label="Workflow"
            value={`${snapshot?.workflows.runningRunCount ?? 0} running`}
            meta={`${workflowDefinitions.length} definitions`}
          />
          <SummaryCard
            label="Trace"
            value={`${snapshot?.traces.totalCount ?? 0} events`}
            meta={`${snapshot?.traces.uniqueSessions ?? 0} sessions`}
          />
          <SummaryCard
            label="Schedules"
            value={`${schedules.filter((schedule) => schedule.enabled).length} enabled`}
            meta={`${schedules.length} total`}
          />
          <SummaryCard
            label="Webhooks"
            value={`${webhookConfigs.filter((config) => config.enabled).length} enabled`}
            meta={`${webhookLogs.length} recent logs`}
          />
          <SummaryCard
            label="Artifact Gates"
            value={`${snapshot?.artifactGates.blockedTaskCount ?? 0} blocked`}
            meta="review/verify holds"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card className="rounded-2xl shadow-none">
            <CardHeader>
              <CardTitle>Kanban Queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot?.kanban.activeAutomations.length ||
              snapshot?.kanban.queuedAutomations.length ? (
                <>
                  {snapshot?.kanban.activeAutomations.map((automation) => (
                    <QueueRow
                      key={`active-${automation.taskId}`}
                      label="active"
                      title={automation.taskTitle}
                      meta={`${automation.boardId} · ${automation.columnId}`}
                    />
                  ))}
                  {snapshot?.kanban.queuedAutomations.map((automation) => (
                    <QueueRow
                      key={`queued-${automation.taskId}`}
                      label="queued"
                      title={automation.taskTitle}
                      meta={`${automation.boardId} · ${automation.columnId} · ${formatDateTime(
                        automation.enqueuedAt,
                      )}`}
                    />
                  ))}
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  当前没有 Kanban automation。
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-none">
            <CardHeader>
              <CardTitle>Background Worker</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot?.backgroundWorker.runningTasks.length ? (
                snapshot.backgroundWorker.runningTasks.map((task) => (
                  <QueueRow
                    key={task.id}
                    label={task.status.toLowerCase()}
                    title={task.title}
                    meta={`${task.triggerSource ?? 'background'} · ${formatDateTime(
                      task.startedAt,
                    )}`}
                  />
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  当前没有 running background task。
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card className="rounded-2xl shadow-none">
            <CardHeader>
              <CardTitle>Running Workflow Runs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot?.workflows.runningRuns.length ? (
                snapshot.workflows.runningRuns.map((run) => (
                  <div
                    key={run.id}
                    className="rounded-xl border border-border/60 bg-muted/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          className="text-sm font-medium underline-offset-4 hover:underline"
                          to={`/projects/${projectId}/workflow-runs/${run.id}`}
                        >
                          {run.workflowName}
                        </Link>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {run.currentStepName
                            ? `当前步骤 ${run.currentStepName}`
                            : '等待下一步'}
                        </div>
                      </div>
                      <Badge variant="outline">{run.status}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-4">
                      <SummaryCard
                        compact
                        label="Done"
                        value={String(run.completedSteps)}
                        meta={`of ${run.totalSteps}`}
                      />
                      <SummaryCard
                        compact
                        label="Running"
                        value={String(run.runningSteps)}
                        meta={`pending ${run.pendingSteps}`}
                      />
                      <SummaryCard
                        compact
                        label="Failed"
                        value={String(run.failedSteps)}
                        meta={`v${run.workflowVersion}`}
                      />
                      <SummaryCard
                        compact
                        label="Updated"
                        value={formatDateTime(run.updatedAt)}
                        meta={run.workflowId}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  当前没有 running workflow run。
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-none">
            <CardHeader>
              <CardTitle>Recent Traces</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot?.traces.recentOrchestrationTraces.length ? (
                snapshot.traces.recentOrchestrationTraces.map((trace) => (
                  <QueueRow
                    key={trace.id}
                    label={trace.eventName ?? 'trace'}
                    title={trace.summary}
                    meta={`${trace.sessionId} · ${formatDateTime(trace.createdAt)}`}
                  />
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  当前还没有 orchestration trace。
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl shadow-none">
          <CardHeader>
            <CardTitle>Workflow Definitions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {workflowDefinitions.length ? (
              workflowDefinitions.map((workflow) => (
                <div
                  key={workflow.id}
                  className="rounded-xl border border-border/60 bg-muted/20 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{workflow.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {workflow.description ?? 'No description'}
                      </div>
                    </div>
                    <Badge variant="secondary">v{workflow.version}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {workflow.steps.map((step) => (
                      <Badge key={`${workflow.id}-${step.name}`} variant="outline">
                        {step.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">
                当前项目还没有 workflow definition。
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <Card className="rounded-2xl shadow-none">
            <CardHeader>
              <CardTitle>Schedules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {schedules.length ? (
                schedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className="rounded-xl border border-border/60 bg-muted/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{schedule.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {schedule.cronExpr}
                        </div>
                      </div>
                      <Badge variant={schedule.enabled ? 'secondary' : 'outline'}>
                        {schedule.enabled ? 'enabled' : 'disabled'}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <SummaryCard
                        compact
                        label="Next"
                        value={formatDateTime(schedule.nextRunAt)}
                        meta={schedule.workflowId}
                      />
                      <SummaryCard
                        compact
                        label="Last"
                        value={formatDateTime(schedule.lastRunAt)}
                        meta={schedule.lastWorkflowRunId ?? 'no run'}
                      />
                      <SummaryCard
                        compact
                        label="Status"
                        value={schedule.enabled ? 'active' : 'paused'}
                        meta={schedule.id}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  当前项目还没有 schedule。
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-none">
            <CardHeader>
              <CardTitle>Webhook Configs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {webhookConfigs.length ? (
                webhookConfigs.map((config) => (
                  <div
                    key={config.id}
                    className="rounded-xl border border-border/60 bg-muted/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{config.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {config.repo}
                        </div>
                      </div>
                      <Badge variant={config.enabled ? 'secondary' : 'outline'}>
                        {config.enabled ? 'enabled' : 'disabled'}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {config.eventTypes.map((eventType) => (
                        <Badge key={`${config.id}-${eventType}`} variant="outline">
                          {eventType}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      {config.webhookSecretConfigured
                        ? 'secret configured'
                        : 'secret missing'}{' '}
                      · {config.workflowId}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  当前项目还没有 webhook config。
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl shadow-none">
          <CardHeader>
            <CardTitle>Recent Webhook Logs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {webhookLogs.length ? (
              webhookLogs.map((log) => (
                <QueueRow
                  key={log.id}
                  label={log.outcome}
                  title={`${log.eventType}${
                    log.eventAction ? ` · ${log.eventAction}` : ''
                  }`}
                  meta={formatWebhookLogMeta(log)}
                />
              ))
            ) : (
              <div className="text-sm text-muted-foreground">
                当前项目还没有 webhook log。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-none">
          <CardHeader>
            <CardTitle>Artifact Gates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot?.artifactGates.blockedTasks.length ? (
              snapshot.artifactGates.blockedTasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-border/60 bg-muted/20 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{task.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {task.columnId ?? 'unknown column'} ·{' '}
                        {task.lastSyncError ?? 'Artifact gate blocked'}
                      </div>
                    </div>
                    <Badge variant="outline">
                      {task.verificationVerdict ?? 'blocked'}
                    </Badge>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <SummaryCard
                      compact
                      label="Lane Session"
                      value={task.latestLaneSession?.sessionId ?? 'none'}
                      meta={
                        task.latestLaneSession
                          ? `${task.latestLaneSession.role ?? 'unknown role'} · ${task.latestLaneSession.status}`
                          : 'no linked session'
                      }
                    />
                    <SummaryCard
                      compact
                      label="Latest Handoff"
                      value={task.latestLaneHandoff?.id ?? 'none'}
                      meta={
                        task.latestLaneHandoff
                          ? `${task.latestLaneHandoff.requestType} · ${task.latestLaneHandoff.status}`
                          : 'no handoff'
                      }
                    />
                    <SummaryCard
                      compact
                      label="Recovery"
                      value={task.triggerSessionId ?? 'no trigger session'}
                      meta={
                        task.latestLaneHandoff?.responseSummary ??
                        'open the active session to provide the missing artifact'
                      }
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {artifactGateSessionLink(projectId, task) ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link to={artifactGateSessionLink(projectId, task) ?? '#'}>
                          Open Session
                        </Link>
                      </Button>
                    ) : null}
                    {task.latestLaneHandoff?.toSessionId ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to={`/projects/${projectId}/sessions/${task.latestLaneHandoff.toSessionId}`}
                        >
                          Open Handoff Target
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">
                当前没有被 artifact gate 阻塞的任务。
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard(props: {
  compact?: boolean;
  label: string;
  meta: string;
  value: string;
}) {
  const { compact = false, label, meta, value } = props;

  return (
    <div
      className={`rounded-xl border border-border/60 bg-muted/20 ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
    </div>
  );
}

function QueueRow(props: {
  label: string;
  meta: string;
  title: string;
}) {
  const { label, meta, title } = props;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
        </div>
        <Badge variant="outline">{label}</Badge>
      </div>
    </div>
  );
}
