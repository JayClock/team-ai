import { State } from '@hateoas-ts/resource';
import { Diagram } from '@shared/schema';
import '@xyflow/react/dist/style.css';
import { Background, Controls, Panel } from '@xyflow/react';
import { Canvas, Spinner } from '@shared/ui';
import { type Signal } from '@preact/signals-react';
import { useEffect, useState } from 'react';
import { nodeTypes } from './node-types';
import { createDiagramStore, type DiagramStore } from './create-diagram-store';
import {
  CommitDraftPanelTool,
  ProposeModelPanelTool,
  PublishDiagramPanelTool,
} from './tools';

interface Props {
  state: Signal<State<Diagram>>;
}

export function ProjectDiagram(props: Props) {
  const { state } = props;
  const diagramState = state.value;
  const [diagramStore, setDiagramStore] = useState<DiagramStore | null>(null);

  useEffect(() => {
    setDiagramStore(createDiagramStore(diagramState));
  }, [diagramState]);

  const storeState = diagramStore?.state.value;

  if (!diagramStore || !storeState || storeState.status === 'loading') {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        <span>Loading diagram...</span>
      </div>
    );
  }

  if (storeState.status === 'load-error') {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-destructive">
        Failed to load diagram: {storeState.error.message}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Canvas
        title={diagramStore.diagramTitle.value}
        nodes={diagramStore.diagramNodes.value}
        edges={diagramStore.diagramEdges.value}
        onNodesChange={(changes) => {
          diagramStore.moveNodes(changes);
        }}
        nodeTypes={nodeTypes}
        fitView
        panOnDrag
        selectionOnDrag={false}
      >
        <Panel position="top-right">
          <div className="bg-background/90 flex items-center gap-2 rounded-md border p-1 shadow-sm">
            <CommitDraftPanelTool diagramStore={diagramStore} />
            <span className="bg-border h-5 w-px" aria-hidden />
            <PublishDiagramPanelTool diagramStore={diagramStore} />
          </div>
        </Panel>
        <Panel position="center-left">
          <div className="flex gap-1">
            <ProposeModelPanelTool
              state={diagramState}
              diagramStore={diagramStore}
            />
          </div>
        </Panel>
        <Background />
        <Controls />
      </Canvas>
    </div>
  );
}
export default ProjectDiagram;
