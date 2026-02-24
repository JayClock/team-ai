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
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { type Signal } from '@preact/signals-react';
import ELK, {
  ElkExtendedEdge,
  ElkNode,
  LayoutOptions,
} from 'elkjs/lib/elk.bundled.js';
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

const elk = new ELK();

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;

const ELK_LAYOUT_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.spacing.nodeNode': '60',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.layered.considerModelOrder': 'NODES_AND_EDGES',
  'elk.layered.considerModelOrder.strategy': 'PREFER_NODES',
  'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
};

type CanvasNodeData = Omit<DiagramNode['data'], 'localData'> & {
  localData:
    | DiagramNode['data']['localData']
    | Record<string, unknown>
    | null;
};

type CanvasEdge = Edge & {
  relationType?: DiagramEdge['data']['relationType'] | null;
};

function isEvidenceNode(node: Node<CanvasNodeData>): boolean {
  const { localData } = node.data;
  if (!localData || typeof localData !== 'object') {
    return false;
  }
  const type = (localData as { type?: unknown }).type;
  return type === 'EVIDENCE';
}

function sortByOriginalOrder(ids: string[], order: Map<string, number>): string[] {
  return [...ids].sort((left, right) => {
    const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
}

function getEvidenceOrder(
  nodes: Node<CanvasNodeData>[],
  edges: CanvasEdge[],
): string[] {
  const orderByNodeId = new Map<string, number>();
  nodes.forEach((node, index) => {
    orderByNodeId.set(node.id, index);
  });

  const evidenceNodeIds = nodes.filter(isEvidenceNode).map((node) => node.id);
  if (evidenceNodeIds.length <= 1) {
    return evidenceNodeIds;
  }

  const evidenceNodeIdSet = new Set(evidenceNodeIds);
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();
  evidenceNodeIds.forEach((nodeId) => {
    inDegree.set(nodeId, 0);
    adjacency.set(nodeId, new Set<string>());
  });

  edges.forEach((edge) => {
    if (edge.relationType !== 'sequence') {
      return;
    }
    if (
      !evidenceNodeIdSet.has(edge.source) ||
      !evidenceNodeIdSet.has(edge.target) ||
      edge.source === edge.target
    ) {
      return;
    }

    const neighbors = adjacency.get(edge.source);
    if (!neighbors || neighbors.has(edge.target)) {
      return;
    }

    neighbors.add(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  });

  const queue = sortByOriginalOrder(
    evidenceNodeIds.filter((nodeId) => (inDegree.get(nodeId) ?? 0) === 0),
    orderByNodeId,
  );
  const result: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) {
      continue;
    }

    result.push(nodeId);
    const neighbors = adjacency.get(nodeId);
    if (!neighbors || neighbors.size === 0) {
      continue;
    }

    neighbors.forEach((neighborId) => {
      const nextInDegree = (inDegree.get(neighborId) ?? 0) - 1;
      inDegree.set(neighborId, nextInDegree);
      if (nextInDegree === 0) {
        queue.push(neighborId);
      }
    });
    queue.sort((left, right) => {
      const leftOrder = orderByNodeId.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = orderByNodeId.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
  }

  if (result.length < evidenceNodeIds.length) {
    const resultSet = new Set(result);
    const remaining = sortByOriginalOrder(
      evidenceNodeIds.filter((nodeId) => !resultSet.has(nodeId)),
      orderByNodeId,
    );
    result.push(...remaining);
  }

  return result;
}

async function applyElkLayout(
  nodes: Node<CanvasNodeData>[],
  edges: CanvasEdge[],
): Promise<Node<CanvasNodeData>[]> {
  if (nodes.length === 0) {
    return [];
  }

  const nodeIdSet = new Set(nodes.map((node) => node.id));
  const modelNodes = nodes.map((node) => ({
    id: node.id,
    width:
      typeof node.data.width === 'number' && node.data.width > 0
        ? node.data.width
        : DEFAULT_NODE_WIDTH,
    height:
      typeof node.data.height === 'number' && node.data.height > 0
        ? node.data.height
        : DEFAULT_NODE_HEIGHT,
  }));

  const baseEdges: ElkExtendedEdge[] = edges
    .filter(
      (edge) =>
        nodeIdSet.has(edge.source) &&
        nodeIdSet.has(edge.target) &&
        edge.source !== edge.target,
    )
    .map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    }));

  const evidenceOrder = getEvidenceOrder(nodes, edges);
  const evidenceOrderEdges: ElkExtendedEdge[] = evidenceOrder
    .slice(1)
    .map((targetId, index) => {
      const sourceId = evidenceOrder[index];
      return {
        id: `__evidence-order-${sourceId}-${targetId}`,
        sources: [sourceId],
        targets: [targetId],
        layoutOptions: {
          'elk.layered.priority.direction': '100',
        },
      };
    });

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: ELK_LAYOUT_OPTIONS,
    children: modelNodes,
    edges: [...baseEdges, ...evidenceOrderEdges],
  };

  const layout = await elk.layout(graph);
  const positions = new Map<string, { x: number; y: number }>();
  (layout.children ?? []).forEach((child) => {
    if (typeof child.x !== 'number' || typeof child.y !== 'number') {
      return;
    }
    positions.set(child.id, { x: child.x, y: child.y });
  });

  return nodes.map((node) => {
    const position = positions.get(node.id);
    if (!position) {
      return node;
    }
    return {
      ...node,
      position,
    };
  });
}

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

  const nodes = useMemo<Node<CanvasNodeData>[]>(
    () =>
      nodesState.collection.map((nodeState) => {
        const localData =
          logicalEntityDataByNodeId.get(nodeState.data.id) ??
          nodeState.data.localData ??
          null;
        const node = {
          id: nodeState.data.id,
          type: nodeState.data.type,
          position: {
            x: nodeState.data.positionX,
            y: nodeState.data.positionY,
          },
          data: {
            ...nodeState.data,
            localData,
          },
        };
        return node;
      }),
    [logicalEntityDataByNodeId, nodesState.collection],
  );

  const edges = useMemo<CanvasEdge[]>(
    () =>
      edgesState.collection.map((edgeState) => ({
        id: edgeState.data.id,
        source: edgeState.data.sourceNode.id,
        target: edgeState.data.targetNode.id,
        relationType: edgeState.data.relationType,
      })),
    [edgesState.collection],
  );

  const canvasNodes = useMemo(
    () => [...nodes, ...optimisticNodes],
    [nodes, optimisticNodes],
  );

  const canvasEdges = useMemo<CanvasEdge[]>(
    () =>
      [
        ...edges,
        ...optimisticEdges.map((edge) => ({
          ...edge,
          relationType: null,
        })),
      ],
    [edges, optimisticEdges],
  );

  const [layoutedCanvasNodes, setLayoutedCanvasNodes] =
    useState<Node<CanvasNodeData>[]>(canvasNodes);
  const layoutRunIdRef = useRef(0);

  useEffect(() => {
    setLayoutedCanvasNodes(canvasNodes);
    const runId = layoutRunIdRef.current + 1;
    layoutRunIdRef.current = runId;
    let disposed = false;

    void applyElkLayout(canvasNodes, canvasEdges)
      .then((nextNodes) => {
        if (disposed || layoutRunIdRef.current !== runId) {
          return;
        }
        setLayoutedCanvasNodes(nextNodes);
      })
      .catch(() => {
        if (disposed || layoutRunIdRef.current !== runId) {
          return;
        }
        setLayoutedCanvasNodes(canvasNodes);
      });

    return () => {
      disposed = true;
    };
  }, [canvasEdges, canvasNodes]);

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Canvas
        title={diagramState.data.title}
        nodes={layoutedCanvasNodes}
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
