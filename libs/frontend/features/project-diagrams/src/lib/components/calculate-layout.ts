import { LogicalEntity } from '@shared/schema';
import { Edge, Node } from '@xyflow/react';

type DiagramNode = Node<LogicalEntity['data']>;
type DiagramEdge = Edge;
type Position = { x: number; y: number };

export const LAYOUT_NODE_WIDTH = 160;
export const LAYOUT_NODE_HEIGHT = 80;
export const LAYOUT_GAP_X = 80;
export const LAYOUT_GAP_Y = 40;
export const LAYOUT_START_X = 120;
export const LAYOUT_AXIS_Y = 240;
const COLUMN_STEP_X = LAYOUT_NODE_WIDTH + LAYOUT_GAP_X;
const DEFAULT_REQUEST_COLUMN_X = LAYOUT_START_X + 3 * COLUMN_STEP_X;

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

function isContractRoleNode(node: DiagramNode): boolean {
  return node.data.type === 'ROLE' && node.data.subType === 'party_role';
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

function getNodeHeight(node: DiagramNode | undefined): number {
  return node?.height ?? LAYOUT_NODE_HEIGHT;
}

function normalizeFallbackY(node: DiagramNode): number {
  if (node.position.x === 0 && node.position.y === 0) {
    return LAYOUT_AXIS_Y;
  }

  return node.position.y;
}

function collectNodesByPredicate(
  nodes: DiagramNode[],
  predicate: (node: DiagramNode) => boolean,
): DiagramNode[] {
  return nodes.filter(predicate);
}

function spreadColumnNodesById(params: {
  basePositionsById: Map<string, Position>;
  defaultX: number;
  nodeById: Map<string, DiagramNode>;
  nodeIds: string[];
}): Map<string, Position> {
  const { basePositionsById, defaultX, nodeById, nodeIds } = params;
  const nextPositionsById = new Map<string, Position>(basePositionsById);
  const nodeIdsByX = new Map<number, string[]>();

  for (const nodeId of nodeIds) {
    const node = nodeById.get(nodeId);
    if (!node) {
      continue;
    }

    const basePosition = nextPositionsById.get(nodeId);
    const x = basePosition?.x ?? defaultX;
    const y = basePosition?.y ?? normalizeFallbackY(node);
    nextPositionsById.set(nodeId, { x, y });
    const nodeIdsOnColumn = nodeIdsByX.get(x) ?? [];
    nodeIdsOnColumn.push(nodeId);
    nodeIdsByX.set(x, nodeIdsOnColumn);
  }

  for (const columnNodeIds of nodeIdsByX.values()) {
    const sortedNodeIds = [...columnNodeIds].sort((leftId, rightId) => {
      const leftPosition = nextPositionsById.get(leftId);
      const rightPosition = nextPositionsById.get(rightId);
      if (!leftPosition || !rightPosition) {
        return leftId.localeCompare(rightId);
      }

      if (leftPosition.y !== rightPosition.y) {
        return leftPosition.y - rightPosition.y;
      }

      return leftId.localeCompare(rightId);
    });

    for (let index = 1; index < sortedNodeIds.length; index += 1) {
      const previousNodeId = sortedNodeIds[index - 1];
      const currentNodeId = sortedNodeIds[index];
      const previousPosition = nextPositionsById.get(previousNodeId);
      const currentPosition = nextPositionsById.get(currentNodeId);
      if (!previousPosition || !currentPosition) {
        continue;
      }

      const minDeltaY =
        (getNodeHeight(nodeById.get(previousNodeId)) +
          getNodeHeight(nodeById.get(currentNodeId))) /
        2 +
        LAYOUT_GAP_Y;
      const minimumCurrentY = previousPosition.y + minDeltaY;
      if (currentPosition.y < minimumCurrentY) {
        nextPositionsById.set(currentNodeId, {
          x: currentPosition.x,
          y: minimumCurrentY,
        });
      }
    }
  }

  return nextPositionsById;
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

function collectContractRolesByContractId(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): Map<string, DiagramNode[]> {
  const nodeById = buildNodeById(nodes);
  const rolesByContractId = new Map<string, DiagramNode[]>();

  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) {
      continue;
    }

    const match = isContractNode(sourceNode) && isContractRoleNode(targetNode)
      ? { contract: sourceNode, role: targetNode }
      : isContractNode(targetNode) && isContractRoleNode(sourceNode)
        ? { contract: targetNode, role: sourceNode }
        : null;
    if (!match) {
      continue;
    }

    const roles = rolesByContractId.get(match.contract.id) ?? [];
    if (!roles.some((role) => role.id === match.role.id)) {
      roles.push(match.role);
      rolesByContractId.set(match.contract.id, roles);
    }
  }

  return rolesByContractId;
}

function buildContractRolePositionsById(params: {
  contractById: Map<string, DiagramNode>;
  rolesByContractId: Map<string, DiagramNode[]>;
}): Map<string, Position> {
  const { contractById, rolesByContractId } = params;
  const rolePositionsById = new Map<string, Position>();
  const roleStepY = LAYOUT_NODE_HEIGHT + LAYOUT_GAP_Y;

  for (const [contractId, roles] of rolesByContractId.entries()) {
    const contract = contractById.get(contractId);
    if (!contract) {
      continue;
    }

    roles.forEach((role, index) => {
      const layer = Math.floor(index / 2) + 1;
      const direction = index % 2 === 0 ? -1 : 1;
      rolePositionsById.set(role.id, {
        x: contract.position.x,
        y: contract.position.y + direction * layer * roleStepY,
      });
    });
  }

  return rolePositionsById;
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
  const rolesByContractId = collectContractRolesByContractId(axisLayoutedNodes, edges);
  const contractRolePositionsById = buildContractRolePositionsById({
    contractById,
    rolesByContractId,
  });
  const requestsByContractId = collectRequestGroupsByContractId(
    axisLayoutedNodes,
    edges,
  );
  const requestPositionsById = buildRequestPositionsById({
    contractById,
    requestsByContractId,
  });
  const requestNodes = collectNodesByPredicate(
    axisLayoutedNodes,
    isFulfillmentRequestNode,
  );
  const spreadRequestPositionsById = spreadColumnNodesById({
    basePositionsById: requestPositionsById,
    defaultX: DEFAULT_REQUEST_COLUMN_X,
    nodeById,
    nodeIds: requestNodes.map((node) => node.id),
  });
  const confirmationByRequestId = collectConfirmationByRequestId(
    axisLayoutedNodes,
    edges,
  );
  const confirmationPositionsById = buildConfirmationPositionsById({
    confirmationByRequestId,
    nodeById,
    requestPositionsById: spreadRequestPositionsById,
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
    ...contractRolePositionsById.entries(),
    ...spreadRequestPositionsById.entries(),
    ...confirmationPositionsById.entries(),
    ...otherEvidencePositionsById.entries(),
  ]);
  if (positionsById.size === 0) {
    return axisLayoutedNodes;
  }

  return applyPositionsById(axisLayoutedNodes, positionsById);
}
