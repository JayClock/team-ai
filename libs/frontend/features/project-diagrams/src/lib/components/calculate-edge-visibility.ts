import { LogicalEntity } from '@shared/schema';
import { Edge, Node } from '@xyflow/react';

type DiagramNode = Node<LogicalEntity['data']>;
type DiagramEdge = Edge;

function isPartyRoleNode(node: DiagramNode | undefined): boolean {
  return node?.data?.type === 'ROLE' && node.data?.subType === 'party_role';
}

function isContractNode(node: DiagramNode | undefined): boolean {
  return node?.data?.type === 'EVIDENCE' && node.data?.subType === 'contract';
}

function isEvidenceNode(node: DiagramNode | undefined): boolean {
  return node?.data?.type === 'EVIDENCE';
}

export function calculateEdgeVisibility(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): DiagramEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));

  return edges.map((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const hasPartyRoleEndpoint =
      isPartyRoleNode(sourceNode) || isPartyRoleNode(targetNode);

    if (!hasPartyRoleEndpoint) {
      return edge;
    }

    const isSourcePartyRole = isPartyRoleNode(sourceNode);
    const isTargetPartyRole = isPartyRoleNode(targetNode);
    const connectedNode = isSourcePartyRole ? targetNode : isTargetPartyRole ? sourceNode : undefined;

    if (!isEvidenceNode(connectedNode)) {
      return edge;
    }

    const hidden = !isContractNode(connectedNode);
    if (edge.hidden === hidden) {
      return edge;
    }

    return {
      ...edge,
      hidden,
    };
  });
}
