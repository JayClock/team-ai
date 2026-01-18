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
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import { Project, User } from '@shared/schema';
import { CheckIcon } from 'lucide-react';

import { useEffect, useMemo, useState } from 'react';

interface Props {
  state: State<User>;
  onProjectChange: (projectState: State<Project>) => void;
}

export function UserProjects(props: Props) {
  const { state, onProjectChange } = props;
  const projectsResource = useMemo(() => state.follow('projects'), [state]);
  const { resourceState } = useSuspenseResource(projectsResource);
  const projects = useMemo(() => resourceState.collection, [resourceState]);
  const [selectedProject, setSelectedProject] = useState<State<Project>>();

  useEffect(() => {
    if (
      projects.length > 0 &&
      (!selectedProject || selectedProject.data.id !== projects[0].data.id)
    ) {
      setSelectedProject(projects[0]);
      onProjectChange(projects[0]);
    }
  }, [projects, selectedProject, onProjectChange]);

  const handleProjectChange = (project: State<Project>) => {
    setSelectedProject(project);
    onProjectChange(project);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="cursor-pointer transition-colors duration-200"
        >
          {selectedProject?.data.name}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Select Project</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.map((project) => (
          <DropdownMenuItem
            key={project.data.id}
            onClick={() => handleProjectChange(project)}
            className={
              selectedProject?.data.id === project.data.id
                ? 'bg-accent cursor-pointer'
                : 'cursor-pointer'
            }
          >
            <span className="flex-1">{project.data.name}</span>
            {selectedProject?.data.id === project.data.id && (
              <CheckIcon className="h-4 w-4" aria-hidden="true" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserProjects;
