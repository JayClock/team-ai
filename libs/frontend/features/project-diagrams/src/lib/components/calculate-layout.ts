import { LogicalEntity } from '@shared/schema';
import { Edge, Node } from '@xyflow/react';

type DiagramNode = Node<LogicalEntity['data']>;
type DiagramEdge = Pick<Edge, 'id' | 'source' | 'target'>;
type Position = { x: number; y: number };

export const LAYOUT_NODE_WIDTH = 160;
export const LAYOUT_NODE_HEIGHT = 80;
export const LAYOUT_GAP_X = 80;
export const LAYOUT_GAP_Y = 40;
export const LAYOUT_START_X = 120;
export const LAYOUT_AXIS_Y = 240;

function getEvidenceAxisIndex(
  subType: LogicalEntity['data']['subType'],
): number | null {
  switch (subType) {
    case 'rfp':
      return 0;
    case 'proposal':
      return 1;
    case 'contract':
      return 2;
    default:
      return null;
  }
}

function isEvidenceNode(node: DiagramNode): boolean {
  return node.data.type === 'EVIDENCE';
}

function isContractNode(node: DiagramNode): boolean {
  return isEvidenceNode(node) && node.data.subType === 'contract';
}

function isFulfillmentRequestNode(node: DiagramNode): boolean {
  return isEvidenceNode(node) && node.data.subType === 'fulfillment_request';
}

function layoutEvidenceAxis(nodes: DiagramNode[]): DiagramNode[] {
  return nodes.map((node) => {
    if (!isEvidenceNode(node)) {
      return node;
    }

    const axisIndex = getEvidenceAxisIndex(node.data.subType);
    if (axisIndex === null) {
      return node;
    }

    return {
      ...node,
      position: {
        ...node.position,
        x: LAYOUT_START_X + axisIndex * (LAYOUT_NODE_WIDTH + LAYOUT_GAP_X),
        y: LAYOUT_AXIS_Y,
      },
    };
  });
}

function buildNodeById(nodes: DiagramNode[]): Map<string, DiagramNode> {
  const nodeById = new Map<string, DiagramNode>();
  for (const node of nodes) {
    nodeById.set(node.id, node);
  }
  return nodeById;
}

function collectRequestGroupsByContractId(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): Map<string, DiagramNode[]> {
  const nodeById = buildNodeById(nodes);
  const requestsByContractId = new Map<string, DiagramNode[]>();

  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) {
      continue;
    }

    const match = isContractNode(sourceNode) && isFulfillmentRequestNode(targetNode)
      ? { contract: sourceNode, request: targetNode }
      : isContractNode(targetNode) && isFulfillmentRequestNode(sourceNode)
        ? { contract: targetNode, request: sourceNode }
        : null;
    if (!match) {
      continue;
    }

    const requests = requestsByContractId.get(match.contract.id) ?? [];
    if (!requests.some((request) => request.id === match.request.id)) {
      requests.push(match.request);
      requestsByContractId.set(match.contract.id, requests);
    }
  }

  return requestsByContractId;
}

function buildRequestPositionsById(params: {
  contractById: Map<string, DiagramNode>;
  requestsByContractId: Map<string, DiagramNode[]>;
}): Map<string, Position> {
  const { contractById, requestsByContractId } = params;
  const requestPositionsById = new Map<string, Position>();
  for (const [contractId, requests] of requestsByContractId.entries()) {
    const contract = contractById.get(contractId);
    if (!contract) {
      continue;
    }

    const requestColumnX = contract.position.x + LAYOUT_NODE_WIDTH + LAYOUT_GAP_X;
    const requestStepY = LAYOUT_NODE_HEIGHT + LAYOUT_GAP_Y;
    const totalRequestsHeight =
      requests.length * LAYOUT_NODE_HEIGHT + (requests.length - 1) * LAYOUT_GAP_Y;
    const requestsTopY = contract.position.y - totalRequestsHeight / 2;
    const requestStartY = requestsTopY + LAYOUT_NODE_HEIGHT / 2;

    requests.forEach((request, index) => {
      requestPositionsById.set(request.id, {
        x: requestColumnX,
        y: requestStartY + index * requestStepY,
      });
    });
  }

  return requestPositionsById;
}

function applyRequestPositions(
  nodes: DiagramNode[],
  requestPositionsById: Map<string, Position>,
): DiagramNode[] {
  return nodes.map((node) => {
    const requestPosition = requestPositionsById.get(node.id);
    if (!requestPosition) {
      return node;
    }

    return {
      ...node,
      position: {
        ...node.position,
        ...requestPosition,
      },
    };
  });
}

function collectContractsById(nodes: DiagramNode[]): Map<string, DiagramNode> {
  const contractsById = new Map<string, DiagramNode>();
  for (const node of nodes) {
    if (isContractNode(node)) {
      contractsById.set(node.id, node);
    }
  }
  return contractsById;
}

export function calculateLayout(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): DiagramNode[] {
  const axisLayoutedNodes = layoutEvidenceAxis(nodes);
  const contractById = collectContractsById(axisLayoutedNodes);
  const requestsByContractId = collectRequestGroupsByContractId(
    axisLayoutedNodes,
    edges,
  );
  if (requestsByContractId.size === 0) {
    return axisLayoutedNodes;
  }

  const requestPositionsById = buildRequestPositionsById({
    contractById,
    requestsByContractId,
  });
  return applyRequestPositions(axisLayoutedNodes, requestPositionsById);
}
