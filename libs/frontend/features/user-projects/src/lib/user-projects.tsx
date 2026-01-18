import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@shared/ui';
import { State } from '@hateoas-ts/resource';
import { Project, User } from '@shared/schema';

import { use, useMemo, useState } from 'react';

interface Props {
  state: State<User>;
}

export function UserProjects(props: Props) {
  const { state } = props;
  const projectsResource = useMemo(() => state.follow('projects'), [state]);
  const resourceState = use(projectsResource.get());
  const projects = useMemo(() => resourceState.collection, [resourceState]);
  const [selectedProject, setSelectedProject] = useState(() => projects[0]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {selectedProject.data.name}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Select Project</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.map((project: State<Project>) => (
          <DropdownMenuItem
            key={project.data.id}
            onClick={() => setSelectedProject(project)}
            className={
              selectedProject.data.id === project.data.id ? 'bg-accent' : ''
            }
          >
            {project.data.name}
            {selectedProject.data.id === project.data.id && (
              <span className="ml-auto text-xs">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserProjects;
