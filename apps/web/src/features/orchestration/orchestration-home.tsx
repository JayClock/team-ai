import { Collection, Entity, State } from '@hateoas-ts/resource';
import { useClient } from '@hateoas-ts/resource-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Separator,
  Textarea,
  toast,
} from '@shared/ui';
import { runtimeFetch } from '@shared/util-http';
import {
  ArrowRightIcon,
  FolderGit2Icon,
  Loader2Icon,
  SparklesIcon,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type LocalProject = Entity<{
  createdAt: string;
  description: string | null;
  id: string;
  title: string;
  updatedAt: string;
  workspaceRoot: string | null;
}>;

type LocalProjectCollection = Entity<Collection<LocalProject>['data']>;

type LocalRoot = Entity<
  {
    capabilities: Record<string, boolean>;
    name: string;
  },
  {
    self: LocalRoot;
    projects: LocalProjectCollection;
  }
>;

type OrchestrationSessionResponse = {
  id: string;
  title: string;
};

type ProjectCollectionDocument = {
  _embedded?: {
    projects?: Array<{
      createdAt: string;
      description: string | null;
      id: string;
      title: string;
      updatedAt: string;
      workspaceRoot: string | null;
    }>;
  };
  total?: number;
};

type ProjectDocument = {
  createdAt: string;
  description: string | null;
  id: string;
  title: string;
  updatedAt: string;
  workspaceRoot: string | null;
};

function normalizeWorkspaceRoot(value: string): string {
  return value.trim().replace(/[\\/]+$/u, '');
}

function deriveProjectTitle(workspaceRoot: string): string {
  const segments = normalizeWorkspaceRoot(workspaceRoot).split(/[\\/]/u).filter(Boolean);
  return segments.at(-1) || 'Workspace';
}

function deriveSessionTitle(goal: string): string {
  const normalized = goal.trim().replace(/\s+/gu, ' ');
  if (normalized.length <= 72) {
    return normalized;
  }

  return `${normalized.slice(0, 69).trimEnd()}...`;
}

async function readJson<T>(href: string, init?: RequestInit): Promise<T> {
  const response = await runtimeFetch(href, {
    ...init,
    headers: {
      Accept: 'application/hal+json, application/json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(errorText || `Request failed: ${response.status}`);
    Object.assign(error, { status: response.status });
    throw error;
  }

  return (await response.json()) as T;
}

export default function OrchestrationHome() {
  const client = useClient();
  const navigate = useNavigate();
  const rootResource = useMemo(() => client.go<LocalRoot>('/api'), [client]);
  const [projects, setProjects] = useState<Array<State<LocalProject>>>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formState, setFormState] = useState({
    goal: '',
    workspaceRoot: '',
  });

  useEffect(() => {
    let disposed = false;

    async function loadProjects() {
      setLoading(true);

      try {
        const rootState = await rootResource;
        const projectCollection = await rootState.follow('projects').get();

        if (disposed) {
          return;
        }

        setProjects(projectCollection.collection as Array<State<LocalProject>>);
      } catch (error) {
        if (!disposed) {
          toast.error(
            error instanceof Error ? error.message : 'Failed to load workspaces',
          );
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void loadProjects();

    return () => {
      disposed = true;
    };
  }, [rootResource]);

  const recentProjects = useMemo(() => projects.slice(0, 6), [projects]);

  const ensureProject = useCallback(async (workspaceRoot: string) => {
    const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
    const existingProject =
      projects.find(
        (project) => project.data.workspaceRoot === normalizedWorkspaceRoot,
      ) ??
      null;

    if (existingProject) {
      return existingProject.data;
    }

    const existingByQuery = await readJson<ProjectCollectionDocument>(
      `/api/projects?workspaceRoot=${encodeURIComponent(normalizedWorkspaceRoot)}`,
    );
    const queriedProject = existingByQuery._embedded?.projects?.[0];

    if (queriedProject) {
      return queriedProject;
    }

    try {
      return await readJson<ProjectDocument>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          title: deriveProjectTitle(normalizedWorkspaceRoot),
          workspaceRoot: normalizedWorkspaceRoot,
        }),
      });
    } catch (error) {
      const status = (error as { status?: number }).status;

      if (status === 409) {
        const conflictQuery = await readJson<ProjectCollectionDocument>(
          `/api/projects?workspaceRoot=${encodeURIComponent(
            normalizedWorkspaceRoot,
          )}`,
        );
        const conflictProject = conflictQuery._embedded?.projects?.[0];

        if (conflictProject) {
          return conflictProject;
        }
      }

      throw error;
    }
  }, [projects]);

  const handleCreateSession = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const workspaceRoot = normalizeWorkspaceRoot(formState.workspaceRoot);
      const goal = formState.goal.trim();

      if (!workspaceRoot || !goal) {
        return;
      }

      setSubmitting(true);

      try {
        const project = await ensureProject(workspaceRoot);
        const session = await readJson<OrchestrationSessionResponse>(
          '/api/orchestration/sessions',
          {
            method: 'POST',
            body: JSON.stringify({
              goal,
              projectId: project.id,
              provider: 'codex',
              title: deriveSessionTitle(goal),
              workspaceRoot,
            }),
          },
        );

        toast.success(`Started session ${session.title}`);
        navigate(`/orchestration/${session.id}`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to start session',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [ensureProject, formState.goal, formState.workspaceRoot, navigate],
  );

  return (
    <div className="relative min-h-full overflow-hidden bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_38%,#ffffff_100%)]">
      <div className="absolute inset-x-0 top-0 h-64 bg-[linear-gradient(135deg,rgba(14,165,233,0.16),rgba(59,130,246,0.03),rgba(255,255,255,0))]" />
      <div className="relative mx-auto flex min-h-full w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
        <div className="flex flex-col gap-4 md:max-w-3xl">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-xs font-medium tracking-[0.18em] text-sky-700 uppercase backdrop-blur">
            <SparklesIcon className="size-3.5" />
            Local Session Flow
          </div>
          <div className="space-y-3">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
              Pick a repository and start a focused execution session.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
              Choose a local workspace, describe the change, and run the fixed
              flow: Plan, Implement, Verify.
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_320px]">
          <Card className="border-slate-200/80 bg-white/90 shadow-[0_20px_80px_-48px_rgba(15,23,42,0.5)] backdrop-blur">
            <CardHeader className="gap-3">
              <CardTitle className="text-2xl">New Session</CardTitle>
              <CardDescription className="text-sm leading-6">
                Repository path and request are the only required inputs. Session
                title is derived automatically from your request.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleCreateSession}>
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-slate-700"
                    htmlFor="workspace-root"
                  >
                    Repository path
                  </label>
                  <Input
                    id="workspace-root"
                    placeholder="/Users/you/projects/team-ai"
                    value={formState.workspaceRoot}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        workspaceRoot: event.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-slate-500">
                    Repositories are reused by path, so returning to the same
                    folder keeps the same workspace record.
                  </p>
                </div>

                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-slate-700"
                    htmlFor="session-goal"
                  >
                    Request
                  </label>
                  <Textarea
                    id="session-goal"
                    className="min-h-40 resize-none"
                    placeholder="Describe what you want changed in this repository"
                    value={formState.goal}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        goal: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      Execution stages
                    </p>
                    <p className="text-xs text-slate-500">
                      Plan, Implement, Verify through the local agent gateway.
                    </p>
                  </div>
                  <Button
                    className="min-w-40"
                    disabled={
                      submitting ||
                      normalizeWorkspaceRoot(formState.workspaceRoot).length === 0 ||
                      formState.goal.trim().length === 0
                    }
                    type="submit"
                  >
                    {submitting ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        New Session
                        <ArrowRightIcon className="size-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-slate-200/80 bg-white/90 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-base">Recent Workspaces</CardTitle>
                <CardDescription>
                  Reuse a repository you already opened in the local app.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2Icon className="size-4 animate-spin" />
                    Loading workspaces...
                  </div>
                ) : recentProjects.length > 0 ? (
                  recentProjects.map((project) => {
                    const selected =
                      normalizeWorkspaceRoot(formState.workspaceRoot) ===
                      normalizeWorkspaceRoot(project.data.workspaceRoot ?? '');

                    return (
                      <button
                        key={project.data.id}
                        className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                          selected
                            ? 'border-sky-300 bg-sky-50 text-sky-950'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                        onClick={() =>
                          setFormState((current) => ({
                            ...current,
                            workspaceRoot: project.data.workspaceRoot ?? '',
                          }))
                        }
                        type="button"
                      >
                        <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                          <FolderGit2Icon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {project.data.title}
                          </p>
                          <p className="mt-1 break-all text-xs leading-5 text-slate-500">
                            {project.data.workspaceRoot ?? 'No workspace path'}
                          </p>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                    No saved workspaces yet. Enter a repository path to create the
                    first one.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 bg-slate-950 text-slate-100 shadow-[0_20px_80px_-48px_rgba(15,23,42,0.9)]">
              <CardHeader>
                <CardTitle className="text-base text-white">Session flow</CardTitle>
                <CardDescription className="text-slate-300">
                  Fixed main path for local execution.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {[
                  ['01', 'Plan', 'Analyze the request and shape the execution plan.'],
                  ['02', 'Implement', 'Run the change in the selected repository.'],
                  ['03', 'Verify', 'Review the result before the session completes.'],
                ].map(([index, title, description], step) => (
                  <div key={title}>
                    {step > 0 ? <Separator className="mb-4 bg-slate-800" /> : null}
                    <div className="flex items-start gap-4">
                      <div className="rounded-full border border-slate-700 px-2 py-1 text-xs font-medium text-slate-300">
                        {index}
                      </div>
                      <div>
                        <p className="font-medium text-white">{title}</p>
                        <p className="mt-1 text-slate-400">{description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
