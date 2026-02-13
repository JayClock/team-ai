import { Collection, State } from '@hateoas-ts/resource';
import { Diagram, DiagramEdge, DiagramNode, DraftDiagramModel } from '@shared/schema';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import '@xyflow/react/dist/style.css';
import { Background, Controls, Edge, Node } from '@xyflow/react';
import { Canvas } from '@shared/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FulfillmentNode } from './fulfillment-node';
import { GroupContainerNode } from './group-container-node';
import { StickyNoteNode } from './sticky-note-node';
import { DiagramTools } from './tools/diagram-tools';
import {
  DraftApplyPayload,
  OptimisticDraftPreview,
  toNodeReferenceKeys,
} from './tools/draft-utils';

interface Props {
  state: State<Diagram>;
}

const nodeTypes = {
  'fulfillment-node': FulfillmentNode,
  'group-container': GroupContainerNode,
  'sticky-note': StickyNoteNode,
};

type BatchNodePayload = {
  type: string;
  logicalEntityId?: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
};

type BatchLogicalEntityPayload = {
  type: DraftDiagramModel['data']['nodes'][number]['localData']['type'];
  name: string;
  label: string;
};

type BatchEdgePayload = {
  sourceNodeId: string;
  targetNodeId: string;
};

export function ProjectDiagram(props: Props) {
  const { state } = props;
  const [diagramResources, setDiagramResources] = useState(() => ({
    nodes: state.follow('nodes'),
    edges: state.follow('edges'),
  }));
  const [optimisticPreview, setOptimisticPreview] =
    useState<OptimisticDraftPreview | null>(null);
  const [pendingDraft, setPendingDraft] =
    useState<DraftDiagramModel['data'] | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

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
    ({ draft, preview }: DraftApplyPayload) => {
      setPendingDraft(draft);
      setOptimisticPreview(preview);
    },
    [],
  );

  const handleDraftApplyReverted = useCallback(() => {
    setPendingDraft(null);
    setOptimisticPreview(null);
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!pendingDraft || isSavingDraft) {
      return;
    }

    if (!state.hasLink('commit-draft')) {
      throw new Error('Current diagram is missing required links for draft save.');
    }

    setIsSavingDraft(true);

    try {
      const draftRefToNodeRef = new Map<string, string>();
      const logicalEntitiesPayload: BatchLogicalEntityPayload[] = [];
      const nodesPayload: BatchNodePayload[] = [];

      for (let index = 0; index < pendingDraft.nodes.length; index += 1) {
        const draftNode = pendingDraft.nodes[index];
        const fallbackName = `entity_${index + 1}`;
        const name = draftNode.localData.name.trim() || fallbackName;
        const label = draftNode.localData.label.trim() || name;
        const logicalEntityRef = `logical-${index + 1}`;
        logicalEntitiesPayload.push({
          type: draftNode.localData.type,
          name,
          label,
        });

        const column = index % 3;
        const row = Math.floor(index / 3);
        const nodeRef = `node-${index + 1}`;

        nodesPayload.push({
          type: 'fulfillment-node',
          logicalEntityId: logicalEntityRef,
          positionX: 120 + column * 300,
          positionY: 120 + row * 180,
          width: 220,
          height: 120,
        });

        for (const key of toNodeReferenceKeys(draftNode, index)) {
          draftRefToNodeRef.set(key, nodeRef);
        }
      }

      const resolveNodeId = (draftRefId: string): string | undefined => {
        const direct = draftRefToNodeRef.get(draftRefId);
        if (direct) {
          return direct;
        }

        const match = draftRefId.match(/node[-_]?(\d+)/i);
        if (!match) {
          return undefined;
        }

        const index = Number(match[1]) - 1;
        return index >= 0 ? `node-${index + 1}` : undefined;
      };

      const edgesPayload: BatchEdgePayload[] = [];
      for (const draftEdge of pendingDraft.edges) {
        const sourceNodeId = resolveNodeId(draftEdge.sourceNode.id);
        const targetNodeId = resolveNodeId(draftEdge.targetNode.id);
        if (!sourceNodeId || !targetNodeId) {
          continue;
        }

        edgesPayload.push({
          sourceNodeId,
          targetNodeId,
        });
      }

      await state.action('commit-draft').submit({
        logicalEntities: logicalEntitiesPayload,
        nodes: nodesPayload,
        edges: edgesPayload,
      });
    } finally {
      setIsSavingDraft(false);
    }
  }, [isSavingDraft, pendingDraft, state]);

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
          canSaveDraft={pendingDraft !== null}
          isSavingDraft={isSavingDraft}
          onSaveDraft={handleSaveDraft}
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
