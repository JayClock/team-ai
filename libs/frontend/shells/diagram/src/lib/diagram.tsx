import { State } from '@hateoas-ts/resource';
import { Diagram } from '@shared/schema';
import { ProjectDiagram } from '@features/project-diagrams';
import { type Signal } from '@preact/signals-react';

interface Props {
  state: Signal<State<Diagram>>;
}

export function ShellsDiagram(props: Props) {
  return <ProjectDiagram state={props.state}></ProjectDiagram>;
}

export default ShellsDiagram;
