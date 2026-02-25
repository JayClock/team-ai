import { State } from '@hateoas-ts/resource';
import { Diagram } from '@shared/schema';
import '@xyflow/react/dist/style.css';
import { Background, Controls, Panel } from '@xyflow/react';
import { Canvas, Spinner } from '@shared/ui';
import { type Signal } from '@preact/signals-react';
import { useEffect, useState } from 'react';
import { nodeTypes } from './node-types';
import { createDiagramStore, type DiagramStore } from './create-diagram-store';
import { ProposeModelPanelTool } from './tools';

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

  if (!diagramStore || diagramStore.isDiagramLoading.value) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        <span>Loading diagram...</span>
      </div>
    );
  }

  if (diagramStore.diagramError.value) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-destructive">
        Failed to load diagram: {diagramStore.diagramError.value.message}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Canvas
        title={diagramStore.diagramTitle.value}
        nodes={diagramStore.diagramNodes.value}
        edges={diagramStore.diagramEdges.value}
        nodeTypes={nodeTypes}
        fitView
      >
        <Panel position="center-left">
          <div className="flex gap-1">
            <ProposeModelPanelTool
              state={diagramState}
              onDraftGenerated={(draft) => {
                void diagramStore.addGeneratedNodesAndEdges(draft);
              }}
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
