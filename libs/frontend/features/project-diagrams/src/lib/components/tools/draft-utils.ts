import { DraftDiagramModel } from '@shared/schema';

const GRID_COLUMNS = 3;
const NODE_X_OFFSET = 120;
const NODE_Y_OFFSET = 120;
const NODE_X_GAP = 300;
const NODE_Y_GAP = 180;

export type OptimisticDraftPreview = {
  nodes: Array<{
    id: string;
    positionX: number;
    positionY: number;
    content: string;
    localdata: DraftDiagramModel['data']['nodes'][number]['localData'];
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
};

export type DraftApplyPayload = {
  draft: DraftDiagramModel['data'];
  preview: OptimisticDraftPreview;
};

export function toNodeReferenceKeys(
  node: DraftDiagramModel['data']['nodes'][number],
  index: number,
): string[] {
  const keys = new Set<string>();
  keys.add(`node-${index + 1}`);
  keys.add(`node_${index + 1}`);
  keys.add(String(index + 1));
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
  const direct = nodeIdByDraftRef.get(draftRefId);
  if (direct) {
    return direct;
  }

  const match = draftRefId.match(/node[-_]?(\d+)/i);
  if (!match) {
    return undefined;
  }

  const index = Number(match[1]) - 1;
  return index >= 0 ? `optimistic-node-${index + 1}` : undefined;
}

export function buildOptimisticDraftPreview(
  draft: DraftDiagramModel['data'],
): OptimisticDraftPreview {
  const nodeIdByDraftRef = new Map<string, string>();
  const nodes: OptimisticDraftPreview['nodes'] = [];

  for (let index = 0; index < draft.nodes.length; index += 1) {
    const draftNode = draft.nodes[index];
    const optimisticNodeId = `optimistic-node-${index + 1}`;
    const position = getGridPosition(index);

    nodes.push({
      id: optimisticNodeId,
      positionX: position.x,
      positionY: position.y,
      content: `${draftNode.localData.label} (${draftNode.localData.type})`,
      localdata: draftNode.localData,
    });

    for (const key of toNodeReferenceKeys(draftNode, index)) {
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
      id: `optimistic-edge-${index + 1}`,
      source,
      target,
    });
  }

  return { nodes, edges };
}
