import { Collection, State } from '@hateoas-ts/resource';
import { Diagram, DiagramEdge, DiagramNode } from '@shared/schema';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import '@xyflow/react/dist/style.css';
import { Background, Controls, Edge } from '@xyflow/react';
import { Canvas, Panel } from '@shared/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FulfillmentNode } from './fulfillment-node';
import { GroupContainerNode } from './group-container-node';
import { StickyNoteNode } from './sticky-note-node';
import {
  CommitDraftPanelTool,
  useCommitDraft,
} from './tools/commit-draft-panel-tool';
import {
  ProposeModelPanelTool,
  useProposeModelDraft,
} from './tools/propose-model-panel-tool';

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

  const {
    canSaveDraft,
    isSavingDraft,
    handleSaveDraft,
    handleDraftApplyOptimistic: handleCommitDraftApplyOptimistic,
    handleDraftApplyReverted: handleCommitDraftApplyReverted,
  } = useCommitDraft({ state });

  const {
    optimisticNodes,
    optimisticEdges,
    handleDraftApplyOptimistic,
    handleDraftApplyReverted,
  } = useProposeModelDraft({
    onDraftApplyOptimistic: handleCommitDraftApplyOptimistic,
    onDraftApplyReverted: handleCommitDraftApplyReverted,
  });

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
        source: edgeState.data.sourceNode.id,
        target: edgeState.data.targetNode.id,
      })),
    [edgesState.collection],
  );

  const canvasNodes = useMemo(
    () => [...nodes, ...optimisticNodes],
    [nodes, optimisticNodes],
  );

  const canvasEdges = useMemo(
    () => [...edges, ...optimisticEdges],
    [edges, optimisticEdges],
  );

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Canvas
        title={state.data.title}
        nodes={canvasNodes}
        edges={canvasEdges}
        nodeTypes={nodeTypes}
        fitView
      >
        <Panel position="center-left">
          <div className="flex gap-1">
            <ProposeModelPanelTool
              state={state}
              isSavingDraft={isSavingDraft}
              onDraftApplyOptimistic={handleDraftApplyOptimistic}
              onDraftApplyReverted={handleDraftApplyReverted}
            />
          </div>
        </Panel>
        <Panel position="top-right">
          <CommitDraftPanelTool
            canSaveDraft={canSaveDraft}
            isSavingDraft={isSavingDraft}
            onSaveDraft={handleSaveDraft}
          />
        </Panel>
        <Background />
        <Controls />
      </Canvas>
    </div>
  );
}
export default ProjectDiagram;
