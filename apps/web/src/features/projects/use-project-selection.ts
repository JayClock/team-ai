import { Entity, Resource, State } from '@hateoas-ts/resource';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

export type LocalProject = Entity<{
  createdAt: string;
  description: string | null;
  id: string;
  repoPath: string | null;
  sourceType: 'github' | 'local' | null;
  sourceUrl: string | null;
  title: string;
  updatedAt: string;
}>;

export function projectTitle(project: State<LocalProject>): string {
  return project.data.title?.trim() || project.data.id;
}

export function useProjectSelection() {
  const client = useClient();
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

  return {
    projects,
    refreshProjects: () => projectsResource.refresh(),
    selectedProject,
  };
}
