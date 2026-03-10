import { State } from '@hateoas-ts/resource';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { useAcpSession } from '@features/project-conversations';
import { AcpSessionSummary, Project, Root } from '@shared/schema';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  toast,
} from '@shared/ui';
import {
  ArrowRightIcon,
  Clock3Icon,
  SparklesIcon,
  WorkflowIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { storePendingProjectPrompt } from './pending-project-prompt';
import {
  LocalProject,
  projectTitle,
  useProjectSelection,
} from './use-project-selection';

function timestamp(value: string | null): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'n/a';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function sessionDisplayName(session: State<AcpSessionSummary>): string {
  return session.data.name?.trim() || `Session ${session.data.id.slice(0, 8)}`;
}

export default function ProjectHome() {
  const navigate = useNavigate();
  const { projects, selectedProject } = useProjectSelection();

  if (projects.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>No local project yet. Import or create a project first.</p>
            <div className="flex gap-2">
              <Button onClick={() => navigate('/orchestration')}>
                Open Orchestration
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!selectedProject) {
    return null;
  }

  return (
    <ProjectHomeContent
      selectedProject={selectedProject}
    />
  );
}

function ProjectHomeContent(props: {
  selectedProject: State<LocalProject>;
}) {
  const { selectedProject } = props;
  const client = useClient();
  const navigate = useNavigate();
  const projectState = selectedProject as unknown as State<Project>;
  const meResource = useMemo(
    () => client.go<Root>('/api').follow('me'),
    [client],
  );
  const { data: me } = useSuspenseResource(meResource);
  const { sessionsResource, create } = useAcpSession(projectState, {
    actorUserId: me.id,
    provider: 'codex',
    mode: 'CHAT',
    historyLimit: 50,
  });

  const [provider] = useState('codex');
  const [mode, setMode] = useState('CHAT');
  const [recentSessions, setRecentSessions] = useState<State<AcpSessionSummary>[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [startingSession, setStartingSession] = useState(false);

  const loadRecentSessions = useCallback(async () => {
    setLoadingRecent(true);
    try {
      let currentPage = await sessionsResource.refresh();
      const allSessions = [...currentPage.collection];
      while (currentPage.hasLink('next')) {
        currentPage = await currentPage.follow('next').get();
        allSessions.push(...currentPage.collection);
      }
      allSessions.sort((left, right) => {
        const leftTime = timestamp(
          left.data.lastActivityAt ?? left.data.startedAt ?? left.data.completedAt,
        );
        const rightTime = timestamp(
          right.data.lastActivityAt ?? right.data.startedAt ?? right.data.completedAt,
        );
        return rightTime - leftTime;
      });
      setRecentSessions(allSessions.slice(0, 8));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load ACP sessions';
      toast.error(message);
    } finally {
      setLoadingRecent(false);
    }
  }, [sessionsResource]);

  useEffect(() => {
    void loadRecentSessions();
  }, [loadRecentSessions]);

  const handleHomeSubmit = async ({ text }: { files: unknown[]; text: string }) => {
    const prompt = text.trim();
    if (!prompt) {
      toast.error('Prompt can not be blank');
      return;
    }

    setStartingSession(true);
    try {
      const created = await create({
        actorUserId: me.id,
        provider,
        mode,
        goal: prompt,
      });
      storePendingProjectPrompt(created.data.id, prompt);
      await loadRecentSessions();
      navigate(`/sessions/${created.data.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create ACP session';
      toast.error(message);
    } finally {
      setStartingSession(false);
    }
  };

  return (
    <div className="min-w-0 p-4 md:p-6">
      <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center gap-8 py-4">
        <div className="space-y-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/80 px-3 py-1 text-xs font-medium tracking-[0.16em] text-amber-700 uppercase">
            <SparklesIcon className="size-3.5" />
            Project Session
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              {projectTitle(selectedProject)}
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Start from intent. Enter the first prompt here, then continue the
              conversation inside a dedicated ACP session page.
            </p>
          </div>
        </div>

        <Card className="mx-auto w-full max-w-3xl border-border/70 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]">
          <CardContent className="p-4 md:p-5">
            <PromptInput onSubmit={handleHomeSubmit}>
              <PromptInputBody className="rounded-2xl border border-input bg-background shadow-sm transition-all duration-200 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <PromptInputTextarea
                  placeholder="What do you want to accomplish in this project?"
                  className="min-h-32 resize-none border-0 bg-transparent text-sm leading-7 focus-visible:ring-0 focus-visible:ring-offset-0 md:text-[15px]"
                  disabled={startingSession}
                  aria-label="Project home input"
                />
              </PromptInputBody>
              <PromptInputFooter className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <PromptInputTools>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border bg-muted/50 px-2.5 py-1">
                      {selectedProject.data.workspaceRoot ?? 'No local path'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setMode((current) => (current === 'CHAT' ? 'PLAN' : 'CHAT'))
                      }
                      className="rounded-full border bg-background px-2.5 py-1 transition-colors hover:bg-muted"
                    >
                      Mode: {mode}
                    </button>
                    <span className="rounded-full border bg-background px-2.5 py-1">
                      Provider: {provider}
                    </span>
                  </div>
                </PromptInputTools>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/orchestration')}
                  >
                    <WorkflowIcon className="size-4" />
                    Open Orchestration
                  </Button>
                  <PromptInputSubmit
                    status={startingSession ? 'submitted' : undefined}
                  />
                </div>
              </PromptInputFooter>
            </PromptInput>
          </CardContent>
        </Card>

        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Clock3Icon className="size-4 text-muted-foreground" />
            Recent Sessions
          </div>
          {loadingRecent ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Loading recent sessions...
              </CardContent>
            </Card>
          ) : recentSessions.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No ACP sessions yet. Start from the input above.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {recentSessions.map((session) => (
                <button
                  key={session.data.id}
                  type="button"
                  onClick={() => navigate(`/sessions/${session.data.id}`)}
                  className="rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {sessionDisplayName(session)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {session.data.state} ·{' '}
                        {formatDateTime(
                          session.data.lastActivityAt ??
                            session.data.startedAt ??
                            session.data.completedAt,
                        )}
                      </div>
                    </div>
                    <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
