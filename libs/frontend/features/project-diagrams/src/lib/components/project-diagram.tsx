import { Collection, State } from '@hateoas-ts/resource';
import { Diagram, DiagramNode, DiagramEdge } from '@shared/schema';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import '@xyflow/react/dist/style.css';
import { Background, Controls, Edge, Node } from '@xyflow/react';
import { Canvas } from '@shared/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FulfillmentNode } from './fulfillment-node';
import { GroupContainerNode } from './group-container-node';
import { StickyNoteNode } from './sticky-note-node';
import { DiagramTools } from './tools/diagram-tools';
import { OptimisticDraftPreview } from './tools/settings-tool';

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
  const [diagramResources, setDiagramResources] = useState(() => ({
    nodes: state.follow('nodes'),
    edges: state.follow('edges'),
  }));
  const [optimisticPreview, setOptimisticPreview] =
    useState<OptimisticDraftPreview | null>(null);

  const refreshDiagramResources = useCallback(() => {
    setDiagramResources({
      nodes: state.follow('nodes'),
      edges: state.follow('edges'),
    });
  }, [state]);

  useEffect(() => {
    refreshDiagramResources();
  }, [refreshDiagramResources]);

  const { resourceState: nodesState } = useSuspenseResource<
    Collection<DiagramNode>
  >(diagramResources.nodes);

  const { resourceState: edgesState } = useSuspenseResource<
    Collection<DiagramEdge>
  >(diagramResources.edges);

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

  const edges = useMemo<Edge[]>(
    () =>
      edgesState.collection.map((edgeState) => ({
        id: edgeState.data.id,
        source: edgeState.data.sourceNodeId,
        target: edgeState.data.targetNodeId,
      })),
    [edgesState.collection],
  );

  const optimisticNodes = useMemo<Node[]>(
    () =>
      optimisticPreview?.nodes.map((node) => ({
        id: node.id,
        type: 'sticky-note',
        position: {
          x: node.positionX,
          y: node.positionY,
        },
        data: {
          content: node.content,
          localData: {
            optimistic: true,
          },
        },
      })) ?? [],
    [optimisticPreview],
  );

  const optimisticEdges = useMemo<Edge[]>(
    () =>
      optimisticPreview?.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: true,
      })) ?? [],
    [optimisticPreview],
  );

  const canvasNodes = useMemo(
    () => [...nodes, ...optimisticNodes],
    [nodes, optimisticNodes],
  );
  const canvasEdges = useMemo(
    () => [...edges, ...optimisticEdges],
    [edges, optimisticEdges],
  );

  const handleDraftApplyOptimistic = useCallback(
    (preview: OptimisticDraftPreview) => {
      setOptimisticPreview(preview);
    },
    [],
  );

  const handleDraftApplyReverted = useCallback(() => {
    setOptimisticPreview(null);
  }, []);

  const handleDraftApplied = useCallback(() => {
    setOptimisticPreview(null);
    refreshDiagramResources();
  }, [refreshDiagramResources]);

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Canvas
        title={state.data.title}
        nodes={canvasNodes}
        edges={canvasEdges}
        nodeTypes={nodeTypes}
        fitView
      >
        <DiagramTools
          state={state}
          onDraftApplied={handleDraftApplied}
          onDraftApplyOptimistic={handleDraftApplyOptimistic}
          onDraftApplyReverted={handleDraftApplyReverted}
        />
        <Background />
        <Controls />
      </Canvas>
    </div>
  );
}
export default ProjectDiagram;
