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

function isFulfillmentConfirmationNode(node: DiagramNode): boolean {
  return isEvidenceNode(node) && node.data.subType === 'fulfillment_confirmation';
}

function isOtherEvidenceNode(node: DiagramNode): boolean {
  return isEvidenceNode(node) && node.data.subType === 'other_evidence';
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

function collectConfirmationByRequestId(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): Map<string, DiagramNode> {
  const nodeById = buildNodeById(nodes);
  const confirmationByRequestId = new Map<string, DiagramNode>();

  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) {
      continue;
    }

    const match =
      isFulfillmentRequestNode(sourceNode) && isFulfillmentConfirmationNode(targetNode)
        ? { request: sourceNode, confirmation: targetNode }
        : isFulfillmentRequestNode(targetNode) &&
            isFulfillmentConfirmationNode(sourceNode)
          ? { request: targetNode, confirmation: sourceNode }
          : null;

    if (!match) {
      continue;
    }

    if (!confirmationByRequestId.has(match.request.id)) {
      confirmationByRequestId.set(match.request.id, match.confirmation);
    }
  }

  return confirmationByRequestId;
}

function buildConfirmationPositionsById(params: {
  confirmationByRequestId: Map<string, DiagramNode>;
  nodeById: Map<string, DiagramNode>;
  requestPositionsById: Map<string, Position>;
}): Map<string, Position> {
  const { confirmationByRequestId, nodeById, requestPositionsById } = params;
  const confirmationPositionsById = new Map<string, Position>();

  for (const [requestId, confirmation] of confirmationByRequestId.entries()) {
    const requestPosition =
      requestPositionsById.get(requestId) ?? nodeById.get(requestId)?.position;
    if (!requestPosition) {
      continue;
    }

    confirmationPositionsById.set(confirmation.id, {
      x: requestPosition.x + LAYOUT_NODE_WIDTH + LAYOUT_GAP_X,
      y: requestPosition.y,
    });
  }

  return confirmationPositionsById;
}

function collectOtherEvidenceByConfirmationId(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): Map<string, DiagramNode> {
  const nodeById = buildNodeById(nodes);
  const otherEvidenceByConfirmationId = new Map<string, DiagramNode>();

  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) {
      continue;
    }

    const match =
      isFulfillmentConfirmationNode(sourceNode) && isOtherEvidenceNode(targetNode)
        ? { confirmation: sourceNode, otherEvidence: targetNode }
        : isFulfillmentConfirmationNode(targetNode) && isOtherEvidenceNode(sourceNode)
          ? { confirmation: targetNode, otherEvidence: sourceNode }
          : null;
    if (!match) {
      continue;
    }

    if (!otherEvidenceByConfirmationId.has(match.confirmation.id)) {
      otherEvidenceByConfirmationId.set(match.confirmation.id, match.otherEvidence);
    }
  }

  return otherEvidenceByConfirmationId;
}

function buildOtherEvidencePositionsById(params: {
  confirmationPositionsById: Map<string, Position>;
  nodeById: Map<string, DiagramNode>;
  otherEvidenceByConfirmationId: Map<string, DiagramNode>;
}): Map<string, Position> {
  const { confirmationPositionsById, nodeById, otherEvidenceByConfirmationId } = params;
  const otherEvidencePositionsById = new Map<string, Position>();

  for (const [confirmationId, otherEvidence] of otherEvidenceByConfirmationId.entries()) {
    const confirmationPosition =
      confirmationPositionsById.get(confirmationId) ??
      nodeById.get(confirmationId)?.position;
    if (!confirmationPosition) {
      continue;
    }

    otherEvidencePositionsById.set(otherEvidence.id, {
      x: confirmationPosition.x + LAYOUT_NODE_WIDTH + LAYOUT_GAP_X,
      y: confirmationPosition.y,
    });
  }

  return otherEvidencePositionsById;
}

function applyPositionsById(
  nodes: DiagramNode[],
  positionsById: Map<string, Position>,
): DiagramNode[] {
  return nodes.map((node) => {
    const nodePosition = positionsById.get(node.id);
    if (!nodePosition) {
      return node;
    }

    return {
      ...node,
      position: {
        ...node.position,
        ...nodePosition,
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
  const nodeById = buildNodeById(axisLayoutedNodes);
  const contractById = collectContractsById(axisLayoutedNodes);
  const requestsByContractId = collectRequestGroupsByContractId(
    axisLayoutedNodes,
    edges,
  );
  const requestPositionsById = buildRequestPositionsById({
    contractById,
    requestsByContractId,
  });
  const confirmationByRequestId = collectConfirmationByRequestId(
    axisLayoutedNodes,
    edges,
  );
  const confirmationPositionsById = buildConfirmationPositionsById({
    confirmationByRequestId,
    nodeById,
    requestPositionsById,
  });
  const otherEvidenceByConfirmationId = collectOtherEvidenceByConfirmationId(
    axisLayoutedNodes,
    edges,
  );
  const otherEvidencePositionsById = buildOtherEvidencePositionsById({
    confirmationPositionsById,
    nodeById,
    otherEvidenceByConfirmationId,
  });
  const positionsById = new Map<string, Position>([
    ...requestPositionsById.entries(),
    ...confirmationPositionsById.entries(),
    ...otherEvidencePositionsById.entries(),
  ]);
  if (positionsById.size === 0) {
    return axisLayoutedNodes;
  }

  return applyPositionsById(axisLayoutedNodes, positionsById);
}
