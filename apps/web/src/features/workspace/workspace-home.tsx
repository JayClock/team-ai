import { Entity, Resource, State } from '@hateoas-ts/resource';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { ProjectSessionsWorkspace } from '@features/projects';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@shared/ui';
import { FolderOpenIcon, WorkflowIcon } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

type LocalProject = Entity<{
  createdAt: string;
  description: string | null;
  id: string;
  sourceType: 'github' | 'local' | null;
  sourceUrl: string | null;
  title: string;
  updatedAt: string;
  workspaceRoot: string | null;
}>;

function projectTitle(project: State<LocalProject>): string {
  return project.data.title?.trim() || project.data.id;
}

export default function WorkspaceHome() {
  const client = useClient();
  const navigate = useNavigate();
  const { projectId } = useParams();

  const rootResource = useMemo(() => client.go<Entity>('/api'), [client]);
  const { resourceState: rootState } = useSuspenseResource(rootResource);
  const projectsResource = useMemo(
    () => rootState.follow('projects') as Resource<Entity>,
    [rootState],
  );
  const { resourceState: projectsState } = useSuspenseResource(projectsResource);
  const projects = projectsState.collection as State<LocalProject>[];

  const selectedProject = useMemo(() => {
    if (projects.length === 0) {
      return undefined;
    }
    if (!projectId) {
      return projects[0];
    }
    return projects.find((project) => project.data.id === projectId) ?? projects[0];
  }, [projectId, projects]);

  useEffect(() => {
    if (selectedProject && selectedProject.data.id !== projectId) {
      navigate(`/workspace/${selectedProject.data.id}`, { replace: true });
    }
  }, [navigate, projectId, selectedProject]);

  if (projects.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Desktop Workspace</CardTitle>
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
    <div className="grid gap-4 p-4 md:grid-cols-[280px_1fr] md:p-6">
      <Card className="h-fit">
        <CardHeader className="space-y-2">
          <CardTitle>ACP Workspace</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select a project, then create or continue ACP sessions.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {projects.map((project) => {
            const active = project.data.id === selectedProject.data.id;
            return (
              <button
                key={project.data.id}
                type="button"
                onClick={() => navigate(`/workspace/${project.data.id}`)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <FolderOpenIcon className="mt-0.5 size-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {projectTitle(project)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {project.data.workspaceRoot ??
                        project.data.sourceUrl ??
                        'No workspace path'}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}

          <div className="pt-3">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate('/orchestration')}
            >
              <WorkflowIcon className="mr-2 size-4" />
              Open Orchestration
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="min-w-0">
        <div className="mb-4">
          <h1 className="text-xl font-semibold">{projectTitle(selectedProject)}</h1>
          <p className="text-sm text-muted-foreground">
            ACP sessions are now the primary desktop workflow for this project.
          </p>
        </div>
        <ProjectSessionsWorkspace projectState={selectedProject as unknown as State<any>} />
      </div>
    </div>
  );
}
