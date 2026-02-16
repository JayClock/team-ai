import { Collection, State } from '@hateoas-ts/resource';
import { Diagram, DiagramEdge, DiagramNode, LogicalEntity } from '@shared/schema';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import '@xyflow/react/dist/style.css';
import { Background, Controls, Edge, Node } from '@xyflow/react';
import { Canvas, Panel } from '@shared/ui';
import { use, useMemo } from 'react';
import { nodeTypes } from './node-types';
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

type DiagramCanvasNodeData = Omit<DiagramNode['data'], 'localData'> & {
  localData: Record<string, unknown> | null;
};

export function ProjectDiagram(props: Props) {
  const { state } = props;

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

  const nodesResource = useMemo(() => state.follow('nodes'), [state]);

  const { resourceState: nodesState } =
    useSuspenseResource<Collection<DiagramNode>>(nodesResource);

  const edgesResource = useMemo(() => state.follow('edges'), [state]);

  const { resourceState: edgesState } =
    useSuspenseResource<Collection<DiagramEdge>>(edgesResource);

  const logicalEntities = use(
    useMemo(
      () =>
        Promise.all(
          nodesState.collection.map(async (nodeState) => {
            if (!nodeState.hasLink('logical-entity')) {
              return {
                nodeId: nodeState.data.id,
                data: null,
              };
            }

            const logicalEntityState = await nodeState.follow('logical-entity').get();
            return {
              nodeId: nodeState.data.id,
              data: logicalEntityState.data,
            };
          }),
        ),
      [nodesState.collection],
    ),
  );

  const logicalEntityDataByNodeId = useMemo(() => {
    const map = new Map<string, LogicalEntity['data'] | null>();
    logicalEntities.forEach((item) => {
      map.set(item.nodeId, item.data);
    });
    return map;
  }, [logicalEntities]);

  const nodes = useMemo<Node<DiagramCanvasNodeData>[]>(
    () =>
      nodesState.collection.map((nodeState) => ({
        id: nodeState.data.id,
        type: nodeState.data.type,
        position: {
          x: nodeState.data.positionX,
          y: nodeState.data.positionY,
        },
        data: {
          ...nodeState.data,
          localData:
            (logicalEntityDataByNodeId.get(nodeState.data.id) ??
              nodeState.data.localData ??
              null) as Record<string, unknown> | null,
        },
      })),
    [logicalEntityDataByNodeId, nodesState.collection],
  );

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
