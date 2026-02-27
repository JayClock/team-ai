import { LogicalEntity } from '@shared/schema';
import { Edge, Node } from '@xyflow/react';

type DiagramNode = Node<LogicalEntity['data']>;
type DiagramEdge = Pick<Edge, 'source' | 'target'>;

function isEvidenceNode(node: DiagramNode | undefined): boolean {
  return node?.data.type === 'EVIDENCE';
}

function isPartyRoleNode(node: DiagramNode | undefined): boolean {
  return node?.data.type === 'ROLE' && node.data.subType === 'party_role';
}

export function resolveEvidencePartyRoleName(params: {
  edges: DiagramEdge[];
  evidenceNodeId: string;
  nodes: DiagramNode[];
}): string | null {
  const { edges, evidenceNodeId, nodes } = params;
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const evidenceNode = nodeById.get(evidenceNodeId);
  if (!isEvidenceNode(evidenceNode) || evidenceNode?.data.subType === 'contract') {
    return null;
  }

  for (const edge of edges) {
    if (edge.source !== evidenceNodeId && edge.target !== evidenceNodeId) {
      continue;
    }

    const connectedNodeId =
      edge.source === evidenceNodeId ? edge.target : edge.source;
    const connectedNode = nodeById.get(connectedNodeId);
    if (!isPartyRoleNode(connectedNode)) {
      continue;
    }

    const connectedNodeName = connectedNode?.data.name;
    if (!connectedNodeName) {
      continue;
    }

    return connectedNodeName;
  }

  return null;
}
