import { State } from '@hateoas-ts/resource';
import { Diagram } from '@shared/schema';
interface Props {
  state: State<Diagram>;
}

export function ShellsDiagram(props: Props) {
  const { state } = props;
  return <h1>{state.data.title}</h1>;
}

export default ShellsDiagram;
