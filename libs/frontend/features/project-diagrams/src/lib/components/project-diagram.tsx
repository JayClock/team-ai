import { Collection, State } from '@hateoas-ts/resource';
import {
  Diagram,
  DiagramEdge,
  DiagramNode,
  LogicalEntity,
} from '@shared/schema';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import '@xyflow/react/dist/style.css';
import { Background, Controls, Edge, Node } from '@xyflow/react';
import { Canvas, Panel } from '@shared/ui';
import { use, useMemo } from 'react';
import { type Signal } from '@preact/signals-react';
import { nodeTypes } from './node-types';
import {
  CommitDraftPanelTool,
  useCommitDraft,
} from './tools/commit-draft-panel-tool';
import {
  PublishDiagramPanelTool,
  usePublishDiagram,
} from './tools/publish-diagram-panel-tool';
import {
  ProposeModelPanelTool,
  useProposeModelDraft,
} from './tools/propose-model-panel-tool';

interface Props {
  state: Signal<State<Diagram>>;
}

export function ProjectDiagram(props: Props) {
  const { state } = props;
  const diagramState = state.value;

  const {
    canSaveDraft,
    isSavingDraft,
    handleSaveDraft,
    handleDraftApplyOptimistic: handleCommitDraftApplyOptimistic,
    handleDraftApplyReverted: handleCommitDraftApplyReverted,
  } = useCommitDraft({ state: diagramState });

  const { canPublish, isPublishing, handlePublish } = usePublishDiagram({
    state: diagramState,
    hasPendingDraft: canSaveDraft,
    isSavingDraft,
  });

  const {
    optimisticNodes,
    optimisticEdges,
    handleDraftApplyOptimistic,
    handleDraftApplyReverted,
  } = useProposeModelDraft({
    onDraftApplyOptimistic: handleCommitDraftApplyOptimistic,
    onDraftApplyReverted: handleCommitDraftApplyReverted,
  });

  const nodesResource = useMemo(
    () => diagramState.follow('nodes'),
    [diagramState],
  );

  const { resourceState: nodesState } =
    useSuspenseResource<Collection<DiagramNode>>(nodesResource);

  const edgesResource = useMemo(
    () => diagramState.follow('edges'),
    [diagramState],
  );

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

            const logicalEntityState = await nodeState
              .follow('logical-entity')
              .get();
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

  const nodes = useMemo<Node<DiagramNode['data']>[]>(
    () =>
      nodesState.collection.map((nodeState) => {
        const node = {
          id: nodeState.data.id,
          type: nodeState.data.type,
          position: {
            x: nodeState.data.positionX,
            y: nodeState.data.positionY,
          },
          data: nodeState.data,
        };
        const localData = logicalEntityDataByNodeId.get(nodeState.data.id);
        if (localData) {
          node.data.localData = localData;
        }
        return node;
      }),
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
        title={diagramState.data.title}
        nodes={canvasNodes}
        edges={canvasEdges}
        nodeTypes={nodeTypes}
        fitView
      >
        <Panel position="center-left">
          <div className="flex gap-1">
            <ProposeModelPanelTool
              state={diagramState}
              isSavingDraft={isSavingDraft}
              onDraftApplyOptimistic={handleDraftApplyOptimistic}
              onDraftApplyReverted={handleDraftApplyReverted}
            />
          </div>
        </Panel>
        <Panel position="top-right">
          <div className="flex gap-2">
            <CommitDraftPanelTool
              canSaveDraft={canSaveDraft}
              isSavingDraft={isSavingDraft}
              onSaveDraft={handleSaveDraft}
            />
            <PublishDiagramPanelTool
              canPublish={canPublish}
              isPublishing={isPublishing}
              onPublish={handlePublish}
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
