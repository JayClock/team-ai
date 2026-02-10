import { Panel } from '@shared/ui';
import { SettingsTool } from './settings-tool';

export function DiagramTools() {
  return (
    <Panel position="center-left">
      <div className="flex gap-1">
        <SettingsTool />
      </div>
    </Panel>
  );
}
