import { State } from '@hateoas-ts/resource';
import { type Signal } from '@preact/signals-react';
import { Project } from '@shared/schema';
import { FeaturesProjects } from '@features/projects';

interface Props {
  state: Signal<State<Project>>;
}

export function ShellsProject(props: Props) {
  return <FeaturesProjects state={props.state} />;
}

export default ShellsProject;
