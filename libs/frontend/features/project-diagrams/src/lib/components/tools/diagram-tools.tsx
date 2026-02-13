import { State } from '@hateoas-ts/resource';
import { Diagram } from '@shared/schema';
import { Panel } from '@shared/ui';
import { OptimisticDraftPreview, SettingsTool } from './settings-tool';

interface Props {
  state: State<Diagram>;
  onDraftApplied?: () => void;
  onDraftApplyOptimistic?: (preview: OptimisticDraftPreview) => void;
  onDraftApplyReverted?: () => void;
}

export function DiagramTools({
  state,
  onDraftApplied,
  onDraftApplyOptimistic,
  onDraftApplyReverted,
}: Props) {
  return (
    <Panel position="center-left">
      <div className="flex gap-1">
        <SettingsTool
          state={state}
          onDraftApplied={onDraftApplied}
          onDraftApplyOptimistic={onDraftApplyOptimistic}
          onDraftApplyReverted={onDraftApplyReverted}
        />
      </div>
    </Panel>
  );
}
