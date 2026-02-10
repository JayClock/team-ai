import { Collection, State } from '@hateoas-ts/resource';
import { Diagram, DiagramNode, DiagramEdge } from '@shared/schema';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import '@xyflow/react/dist/style.css';
import { Background, Controls, Edge } from '@xyflow/react';
import { Canvas } from '@shared/ui';
import { useState } from 'react';
import { FulfillmentNode } from './fulfillment-node';
import { GroupContainerNode } from './group-container-node';
import { StickyNoteNode } from './sticky-note-node';
import { DiagramTools } from './tools/diagram-tools';

interface Props {
  state: State<Diagram>;
}

const nodeTypes = {
  'fulfillment-node': FulfillmentNode,
  'group-container': GroupContainerNode,
  'sticky-note': StickyNoteNode,
};

export function ProjectDiagram(props: Props) {
  const { state } = props;

  const { resourceState: nodesState } = useSuspenseResource<
    Collection<DiagramNode>
  >(state.follow('nodes'));

  const { resourceState: edgesState } = useSuspenseResource<
    Collection<DiagramEdge>
  >(state.follow('edges'));

  const nodes = nodesState.collection.map((nodeState) => ({
    id: nodeState.data.id,
    type: nodeState.data.type,
    position: {
      x: nodeState.data.positionX,
      y: nodeState.data.positionY,
    },
    data: {
      nodeState,
    },
  }));

  const [edges] = useState<Edge[]>(
    edgesState.collection.map((state) => ({
      id: state.data.id,
      source: state.data.sourceNodeId,
      target: state.data.targetNodeId,
    })),
  );

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Canvas
        title={state.data.title}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
      >
        <DiagramTools />
        <Background />
        <Controls />
      </Canvas>
    </div>
  );
}
export default ProjectDiagram;
