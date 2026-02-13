import { State } from '@hateoas-ts/resource';
import { Diagram } from '@shared/schema';
import { Panel } from '@shared/ui';
import { SettingsTool } from './settings-tool';

interface Props {
  state: State<Diagram>;
}

export function DiagramTools({ state }: Props) {
  return (
    <Panel position="center-left">
      <div className="flex gap-1">
        <SettingsTool state={state} />
      </div>
    </Panel>
  );
}
