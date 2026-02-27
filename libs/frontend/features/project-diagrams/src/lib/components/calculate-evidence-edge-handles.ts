import { LogicalEntity } from '@shared/schema';
import { Edge, Node } from '@xyflow/react';

type DiagramNode = Node<LogicalEntity['data']>;
type DiagramEdge = Edge;

export const EVIDENCE_SOURCE_HANDLE_RIGHT = 'evidence-source-right';
export const EVIDENCE_TARGET_HANDLE_LEFT = 'evidence-target-left';

function isEvidenceNode(node: DiagramNode | undefined): boolean {
  return node?.data?.type === 'EVIDENCE';
}

export function calculateEvidenceEdgeHandles(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): DiagramEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));

  return edges.map((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const isEvidenceToEvidence =
      isEvidenceNode(sourceNode) && isEvidenceNode(targetNode);

    if (!isEvidenceToEvidence) {
      return edge;
    }

    if (
      edge.sourceHandle === EVIDENCE_SOURCE_HANDLE_RIGHT &&
      edge.targetHandle === EVIDENCE_TARGET_HANDLE_LEFT
    ) {
      return edge;
    }

    return {
      ...edge,
      sourceHandle: EVIDENCE_SOURCE_HANDLE_RIGHT,
      targetHandle: EVIDENCE_TARGET_HANDLE_LEFT,
    };
  });
}
