import { DiagramEdge, DiagramNode } from '@shared/schema';

const GRID_COLUMNS = 3;
const NODE_X_OFFSET = 120;
const NODE_Y_OFFSET = 120;
const NODE_X_GAP = 300;
const NODE_Y_GAP = 180;

export type OptimisticDraftPreview = {
  nodes: DiagramNode['data'][];
  edges: DiagramEdge['data'][];
};

export type DraftApplyPayload = {
  draft: {
    nodes: DiagramNode['data'][];
    edges: DiagramEdge['data'][];
  };
  preview: OptimisticDraftPreview;
};

export function toNodeReferenceKeys(
  node: DiagramNode['data'],
): string[] {
  const keys = new Set<string>();
  keys.add(node.id);
  if (node.localData.name) {
    keys.add(node.localData.name);
  }
  if (node.localData.label) {
    keys.add(node.localData.label);
  }
  return Array.from(keys);
}

function getGridPosition(index: number): { x: number; y: number } {
  const column = index % GRID_COLUMNS;
  const row = Math.floor(index / GRID_COLUMNS);
  return {
    x: NODE_X_OFFSET + column * NODE_X_GAP,
    y: NODE_Y_OFFSET + row * NODE_Y_GAP,
  };
}

function resolveNodeReference(
  nodeIdByDraftRef: Map<string, string>,
  draftRefId: string,
): string | undefined {
  return nodeIdByDraftRef.get(draftRefId);
}

export function buildOptimisticDraftPreview(
  draft: {
    nodes: DiagramNode['data'][];
    edges: DiagramEdge['data'][];
  },
): OptimisticDraftPreview {
  const nodeIdByDraftRef = new Map<string, string>();
  const nodes: OptimisticDraftPreview['nodes'] = [];

  for (let index = 0; index < draft.nodes.length; index += 1) {
    const draftNode = draft.nodes[index];
    const optimisticNodeId = `optimistic-${draftNode.id}`;
    const position = getGridPosition(index);

    nodes.push({
      ...draftNode,
      id: optimisticNodeId,
      positionX: typeof draftNode.positionX === 'number' ? draftNode.positionX : position.x,
      positionY: typeof draftNode.positionY === 'number' ? draftNode.positionY : position.y,
    });

    for (const key of toNodeReferenceKeys(draftNode)) {
      nodeIdByDraftRef.set(key, optimisticNodeId);
    }
  }

  const edges: OptimisticDraftPreview['edges'] = [];
  for (let index = 0; index < draft.edges.length; index += 1) {
    const draftEdge = draft.edges[index];
    const source = resolveNodeReference(nodeIdByDraftRef, draftEdge.sourceNode.id);
    const target = resolveNodeReference(nodeIdByDraftRef, draftEdge.targetNode.id);
    if (!source || !target) {
      continue;
    }
    edges.push({
      ...draftEdge,
      id: `optimistic-edge-${index + 1}`,
      sourceNode: { id: source },
      targetNode: { id: target },
    });
  }

  return { nodes, edges };
}
