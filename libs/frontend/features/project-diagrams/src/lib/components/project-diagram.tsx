import { Collection, State } from '@hateoas-ts/resource';
import { Diagram, DiagramNode, DiagramEdge } from '@shared/schema';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import '@xyflow/react/dist/style.css';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  NodeProps,
  Handle,
  Position,
} from '@xyflow/react';
import { useState, Suspense } from 'react';

interface Props {
  state: State<Diagram>;
}

type EntityNodeData = {
  nodeState: State<DiagramNode>;
};

type EntityNode = Node<EntityNodeData, 'entity'>;

function EntityNodeContent({ nodeState }: { nodeState: State<DiagramNode> }) {
  const { resourceState: entityState } = useSuspenseResource(
    nodeState.follow('logical-entity'),
  );

  return (
    <div className="rounded bg-white px-4 py-2 shadow-md border border-gray-200">
      <Handle type="target" position={Position.Top} />
      <div className="font-medium text-sm">{entityState.data.label}</div>
      <div className="text-xs text-gray-500">{entityState.data.type}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function EntityNodeComponent({ data }: NodeProps<EntityNode>) {
  return (
    <Suspense
      fallback={
        <div className="rounded bg-gray-100 px-4 py-2 shadow-md border border-gray-200 animate-pulse">
          <div className="h-4 w-20 bg-gray-300 rounded mb-1" />
          <div className="h-3 w-12 bg-gray-200 rounded" />
        </div>
      }
    >
      <EntityNodeContent nodeState={data.nodeState} />
    </Suspense>
  );
}

const nodeTypes = {
  entity: EntityNodeComponent,
};

export function ProjectDiagram(props: Props) {
  const { state } = props;

  const { resourceState: nodesState } = useSuspenseResource<
    Collection<DiagramNode>
  >(state.follow('nodes'));

  const { resourceState: edgesState } = useSuspenseResource<
    Collection<DiagramEdge>
  >(state.follow('edges'));

  const [nodes] = useState<EntityNode[]>(
    nodesState.collection.map((nodeState) => ({
      id: nodeState.data.id,
      type: 'entity',
      position: {
        x: nodeState.data.positionX,
        y: nodeState.data.positionY,
      },
      data: {
        nodeState,
      },
    })),
  );

  const [edges] = useState<Edge[]>(
    edgesState.collection.map((state) => ({
      id: state.data.id,
      source: state.data.sourceNodeId,
      target: state.data.targetNodeId,
    })),
  );

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <ReactFlow
        title={state.data.title}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
export default ProjectDiagram;
