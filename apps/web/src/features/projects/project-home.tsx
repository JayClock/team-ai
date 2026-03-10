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
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  toast,
} from '@shared/ui';
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  Clock3Icon,
  DownloadIcon,
  LoaderCircleIcon,
  SparklesIcon,
  WorkflowIcon,
  WrenchIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { storePendingProjectPrompt } from './pending-project-prompt';
import { useAcpProviders } from './use-acp-providers';
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
  const {
    install,
    installingProviderId,
    loading: providersLoading,
    providers,
    registryError,
    selectedProvider,
    selectedProviderId,
    setSelectedProviderId,
  } = useAcpProviders('codex');
  const { sessionsResource, create } = useAcpSession(projectState, {
    actorUserId: me.id,
    provider: selectedProviderId,
    mode: 'CHAT',
    historyLimit: 50,
  });

  const [mode, setMode] = useState('CHAT');
  const [providerSheetOpen, setProviderSheetOpen] = useState(false);
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
    if (!selectedProvider) {
      toast.error('No ACP provider is available yet');
      setProviderSheetOpen(true);
      return;
    }
    if (selectedProvider.status !== 'available') {
      toast.error(`Provider ${selectedProvider.name} is not ready yet`);
      setProviderSheetOpen(true);
      return;
    }

    setStartingSession(true);
    try {
      const created = await create({
        actorUserId: me.id,
        provider: selectedProvider.id,
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
                    <button
                      type="button"
                      onClick={() => setProviderSheetOpen(true)}
                      className="inline-flex items-center gap-2 rounded-full border bg-background px-2.5 py-1 transition-colors hover:bg-muted"
                    >
                      <span
                        className={`size-2 rounded-full ${
                          selectedProvider?.status === 'available'
                            ? 'bg-emerald-500'
                            : 'bg-amber-500'
                        }`}
                      />
                      Provider: {selectedProvider?.name ?? selectedProviderId}
                    </button>
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
      <Sheet open={providerSheetOpen} onOpenChange={setProviderSheetOpen}>
        <SheetContent side="right" className="w-full max-w-xl">
          <SheetHeader>
            <SheetTitle>ACP Providers</SheetTitle>
            <SheetDescription>
              Discover providers the way Routa does: inspect local availability,
              pull ACP registry metadata, and prepare missing runtimes from the UI.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
              {registryError ? (
                <p>Registry unavailable: {registryError}</p>
              ) : (
                <p>
                  Select an available provider for the next session. If a provider
                  is missing but installable, prepare it here before you start.
                </p>
              )}
            </div>
            <ScrollArea className="h-[calc(100vh-14rem)] pr-4">
              <div className="space-y-3">
                {providersLoading ? (
                  <Card>
                    <CardContent className="py-6 text-sm text-muted-foreground">
                      Loading ACP providers...
                    </CardContent>
                  </Card>
                ) : (
                  providers.map((provider) => {
                    const isSelected = provider.id === selectedProviderId;
                    const isInstalling = installingProviderId === provider.id;
                    return (
                      <Card
                        key={provider.id}
                        className={
                          isSelected
                            ? 'border-amber-300 shadow-[0_0_0_1px_rgba(245,158,11,0.25)]'
                            : undefined
                        }
                      >
                        <CardContent className="space-y-4 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-medium">
                                  {provider.name}
                                </div>
                                <span className="rounded-full border bg-background px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                                  {provider.source}
                                </span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                                    provider.status === 'available'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  {provider.status}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {provider.description}
                              </p>
                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <span className="rounded-full border bg-background px-2 py-1">
                                  {provider.command ?? provider.envCommandKey}
                                </span>
                                {provider.distributionTypes.map((distributionType) => (
                                  <span
                                    key={distributionType}
                                    className="rounded-full border bg-background px-2 py-1"
                                  >
                                    {distributionType}
                                  </span>
                                ))}
                              </div>
                              {provider.unavailableReason ? (
                                <p className="text-xs text-muted-foreground">
                                  {provider.unavailableReason}
                                </p>
                              ) : null}
                            </div>
                            {isSelected ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                                <CheckCircle2Icon className="size-3.5" />
                                Selected
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant={isSelected ? 'secondary' : 'default'}
                              onClick={() => setSelectedProviderId(provider.id)}
                              disabled={provider.status !== 'available' && !provider.installable}
                            >
                              <WrenchIcon className="size-4" />
                              Use {provider.name}
                            </Button>
                            {provider.installable ? (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => void install(provider.id)}
                                disabled={isInstalling}
                              >
                                {isInstalling ? (
                                  <LoaderCircleIcon className="size-4 animate-spin" />
                                ) : (
                                  <DownloadIcon className="size-4" />
                                )}
                                {provider.installed ? 'Reinstall' : 'Install'}
                              </Button>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
