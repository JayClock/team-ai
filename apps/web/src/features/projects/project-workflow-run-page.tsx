import { State } from '@hateoas-ts/resource';
import { Project } from '@shared/schema';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@shared/ui';
import { runtimeFetch } from '@shared/util-http';
import { projectTitle, useProjectSelection } from '@shells/sessions';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

interface WorkflowRunStep {
  blockedByStepNames: string[];
  completedAt: string | null;
  dependsOnStepNames: string[];
  errorMessage: string | null;
  name: string;
  parallelGroup: string | null;
  resultSessionId: string | null;
  startedAt: string | null;
  status: string;
  taskId: string | null;
  taskOutput: string | null;
  specialistId: string;
}

interface WorkflowRunDetail {
  blockedSteps: number;
  completedAt: string | null;
  completedSteps: number;
  createdAt: string;
  currentStepName: string | null;
  failedSteps: number;
  id: string;
  pendingSteps: number;
  projectId: string;
  runningSteps: number;
  startedAt: string | null;
  status: string;
  steps: WorkflowRunStep[];
  totalSteps: number;
  triggerPayload: string | null;
  triggerSource: string;
  updatedAt: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
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

export default function ProjectWorkflowRunPage() {
  const navigate = useNavigate();
  const { projectId, workflowRunId } = useParams();
  const { projects, selectedProject } = useProjectSelection();
  const projectState = selectedProject as State<Project> | undefined;
  const currentProjectId = projectState?.data.id;
  const [workflowRun, setWorkflowRun] = useState<WorkflowRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<'cancel' | 'reconcile' | null>(
    null,
  );

  const loadWorkflowRun = useCallback(async () => {
    if (!workflowRunId) {
      return;
    }

    setLoading(true);
    try {
      const response = await runtimeFetch(`/api/workflow-runs/${workflowRunId}`);
      if (!response.ok) {
        throw new Error('加载 workflow run 失败');
      }

      setWorkflowRun((await response.json()) as WorkflowRunDetail);
    } finally {
      setLoading(false);
    }
  }, [workflowRunId]);

  useEffect(() => {
    void loadWorkflowRun();
  }, [loadWorkflowRun]);

  const performWorkflowAction = useCallback(
    async (action: 'cancel' | 'reconcile') => {
      if (!workflowRunId) {
        return;
      }

      setPendingAction(action);
      try {
        const response = await runtimeFetch(
          `/api/workflow-runs/${workflowRunId}/${action}`,
          {
            method: 'POST',
          },
        );
        if (!response.ok) {
          throw new Error(`执行 workflow run ${action} 失败`);
        }

        setWorkflowRun((await response.json()) as WorkflowRunDetail);
      } finally {
        setPendingAction(null);
      }
    },
    [workflowRunId],
  );

  if (projects.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-4xl">
          <CardHeader>
            <CardTitle>Workflow Run</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            当前还没有本地项目。
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!projectId || !workflowRunId || !projectState || currentProjectId !== projectId) {
    return null;
  }

  return (
    <div className="min-h-[100dvh] bg-background p-4 md:p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Workflow Run
            </div>
            <h1 className="mt-1 text-2xl font-semibold">
              {loading ? '加载中...' : workflowRun?.workflowName ?? projectTitle(projectState)}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {workflowRun
                ? `${workflowRun.id} · ${workflowRun.triggerSource} · v${workflowRun.workflowVersion}`
                : '查看 step 状态、阻塞原因和执行输出。'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to={`/projects/${projectId}/orchestration`}>返回 Orchestration</Link>
            </Button>
            <Button variant="outline" onClick={() => navigate(-1)}>
              返回上一页
            </Button>
            <Button
              disabled={pendingAction !== null}
              variant="outline"
              onClick={() => void performWorkflowAction('reconcile')}
            >
              {pendingAction === 'reconcile' ? '处理中...' : 'Reconcile'}
            </Button>
            <Button
              disabled={
                pendingAction !== null ||
                workflowRun === null ||
                workflowRun.status === 'COMPLETED' ||
                workflowRun.status === 'FAILED' ||
                workflowRun.status === 'CANCELLED'
              }
              variant="outline"
              onClick={() => void performWorkflowAction('cancel')}
            >
              {pendingAction === 'cancel' ? '取消中...' : 'Cancel Run'}
            </Button>
            <Button
              disabled={pendingAction !== null}
              variant="outline"
              onClick={() => void loadWorkflowRun()}
            >
              刷新
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <SummaryCard
            label="Status"
            value={workflowRun?.status ?? (loading ? '加载中' : 'unknown')}
            meta={workflowRun?.currentStepName ?? 'no current step'}
          />
          <SummaryCard
            label="Completed"
            value={String(workflowRun?.completedSteps ?? 0)}
            meta={`of ${workflowRun?.totalSteps ?? 0}`}
          />
          <SummaryCard
            label="Blocked"
            value={String(workflowRun?.blockedSteps ?? 0)}
            meta={`pending ${workflowRun?.pendingSteps ?? 0}`}
          />
          <SummaryCard
            label="Running"
            value={String(workflowRun?.runningSteps ?? 0)}
            meta={`failed ${workflowRun?.failedSteps ?? 0}`}
          />
          <SummaryCard
            label="Updated"
            value={formatDateTime(workflowRun?.updatedAt)}
            meta={formatDateTime(workflowRun?.startedAt)}
          />
        </div>

        <Card className="rounded-2xl shadow-none">
          <CardHeader>
            <CardTitle>Execution Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {workflowRun?.steps.length ? (
              workflowRun.steps.map((step) => (
                <div
                  key={`${workflowRun.id}-${step.name}`}
                  className="rounded-xl border border-border/60 bg-muted/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{step.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {step.specialistId}
                        {step.parallelGroup ? ` · group ${step.parallelGroup}` : ''}
                      </div>
                    </div>
                    <Badge variant="outline">{step.status}</Badge>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-4">
                    <SummaryCard
                      compact
                      label="Task"
                      value={step.taskId ?? 'N/A'}
                      meta={step.resultSessionId ?? 'no session'}
                    />
                    <SummaryCard
                      compact
                      label="Started"
                      value={formatDateTime(step.startedAt)}
                      meta={formatDateTime(step.completedAt)}
                    />
                    <SummaryCard
                      compact
                      label="Depends"
                      value={
                        step.dependsOnStepNames.length
                          ? step.dependsOnStepNames.join(', ')
                          : 'none'
                      }
                      meta={
                        step.blockedByStepNames.length
                          ? `blocked by ${step.blockedByStepNames.join(', ')}`
                          : 'ready'
                      }
                    />
                    <SummaryCard
                      compact
                      label="Output"
                      value={step.taskOutput?.slice(0, 48) ?? 'no output'}
                      meta={step.errorMessage ?? 'no error'}
                    />
                  </div>

                  {step.taskOutput ? (
                    <pre className="mt-3 overflow-x-auto rounded-lg border border-border/60 bg-background/60 p-3 text-xs whitespace-pre-wrap">
                      {step.taskOutput}
                    </pre>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">
                当前 workflow run 还没有 step 数据。
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
      <div className="mt-2 text-sm font-semibold break-all">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground break-all">{meta}</div>
    </div>
  );
}
