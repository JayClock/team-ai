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
export const CONTEXT_LAYOUT_PADDING_X = 80;
export const CONTEXT_LAYOUT_PADDING_Y = 80;
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

function getNodeWidth(node: DiagramNode | undefined): number {
  return node?.width ?? LAYOUT_NODE_WIDTH;
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

function collectRequestsByFirstContract(params: {
  edges: DiagramEdge[];
  firstContractId: string | null;
  nodes: DiagramNode[];
}): DiagramNode[] {
  const { nodes, edges, firstContractId } = params;
  if (!firstContractId) {
    return [];
  }

  const nodeById = buildNodeById(nodes);
  const requests: DiagramNode[] = [];

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

    if (match.contract.id !== firstContractId) {
      continue;
    }

    if (!requests.some((request) => request.id === match.request.id)) {
      requests.push(match.request);
    }
  }

  return requests;
}

function collectContractRolesByFirstContract(params: {
  edges: DiagramEdge[];
  firstContractId: string | null;
  nodes: DiagramNode[];
}): DiagramNode[] {
  const { nodes, edges, firstContractId } = params;
  if (!firstContractId) {
    return [];
  }

  const nodeById = buildNodeById(nodes);
  const roles: DiagramNode[] = [];

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

    if (match.contract.id !== firstContractId) {
      continue;
    }

    if (!roles.some((role) => role.id === match.role.id)) {
      roles.push(match.role);
    }
  }

  return roles;
}

function buildContractRolePositionsById(params: {
  contract: DiagramNode | undefined;
  roles: DiagramNode[];
}): Map<string, Position> {
  const { contract, roles } = params;
  const rolePositionsById = new Map<string, Position>();
  const roleStepY = LAYOUT_NODE_HEIGHT + LAYOUT_GAP_Y;

  if (!contract) {
    return rolePositionsById;
  }

  roles.forEach((role, index) => {
    const layer = Math.floor(index / 2) + 1;
    const direction = index % 2 === 0 ? -1 : 1;
    rolePositionsById.set(role.id, {
      x: contract.position.x,
      y: contract.position.y + direction * layer * roleStepY,
    });
  });

  return rolePositionsById;
}

function buildRequestPositionsById(params: {
  contract: DiagramNode | undefined;
  requests: DiagramNode[];
}): Map<string, Position> {
  const { contract, requests } = params;
  const requestPositionsById = new Map<string, Position>();

  if (!contract) {
    return requestPositionsById;
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

function findFirstContract(nodes: DiagramNode[]): DiagramNode | undefined {
  for (const node of nodes) {
    if (isContractNode(node)) {
      return node;
    }
  }

  return undefined;
}

function collectContextScopedNodes(params: {
  firstContract: DiagramNode | undefined;
  nodes: DiagramNode[];
}): DiagramNode[] {
  const { firstContract, nodes } = params;
  if (!firstContract) {
    return [];
  }

  const contextId = firstContract.parentId;
  if (!contextId) {
    return nodes;
  }

  return nodes.filter((node) => node.parentId === contextId);
}

function collectScopedEdges(params: {
  edges: DiagramEdge[];
  scopedNodeIds: Set<string>;
}): DiagramEdge[] {
  const { edges, scopedNodeIds } = params;
  return edges.filter(
    (edge) => scopedNodeIds.has(edge.source) && scopedNodeIds.has(edge.target),
  );
}

function applyContextSizeById(params: {
  contextId: string | undefined;
  nodes: DiagramNode[];
}): DiagramNode[] {
  const { contextId, nodes } = params;
  if (!contextId) {
    return nodes;
  }

  const context = nodes.find((node) => node.id === contextId);
  if (!context) {
    return nodes;
  }

  const childNodes = nodes.filter((node) => node.parentId === contextId);
  if (childNodes.length === 0) {
    return nodes;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const childNode of childNodes) {
    const width = getNodeWidth(childNode);
    const height = getNodeHeight(childNode);
    const left = childNode.position.x - width / 2;
    const right = childNode.position.x + width / 2;
    const top = childNode.position.y - height / 2;
    const bottom = childNode.position.y + height / 2;
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);
    minY = Math.min(minY, top);
    maxY = Math.max(maxY, bottom);
  }

  const computedWidth = Math.ceil(maxX - minX + CONTEXT_LAYOUT_PADDING_X * 2);
  const computedHeight = Math.ceil(maxY - minY + CONTEXT_LAYOUT_PADDING_Y * 2);
  const nextWidth = computedWidth;
  const nextHeight = computedHeight;

  if (context.width === nextWidth && context.height === nextHeight) {
    return nodes;
  }

  return nodes.map((node) =>
    node.id === contextId
      ? {
        ...node,
        width: nextWidth,
        height: nextHeight,
      }
      : node,
  );
}

export function calculateLayout(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): DiagramNode[] {
  const firstContract = findFirstContract(nodes);
  if (!firstContract) {
    return layoutEvidenceAxis(nodes);
  }

  const scopedNodes = collectContextScopedNodes({ firstContract, nodes });
  const scopedNodeIds = new Set(scopedNodes.map((node) => node.id));
  const scopedEdges = collectScopedEdges({ edges, scopedNodeIds });
  const axisLayoutedScopedNodes = layoutEvidenceAxis(scopedNodes);
  const nodeById = buildNodeById(axisLayoutedScopedNodes);
  const axisFirstContract = findFirstContract(axisLayoutedScopedNodes);
  const roles = collectContractRolesByFirstContract({
    nodes: axisLayoutedScopedNodes,
    edges: scopedEdges,
    firstContractId: axisFirstContract?.id ?? null,
  });
  const contractRolePositionsById = buildContractRolePositionsById({
    contract: axisFirstContract,
    roles,
  });
  const requests = collectRequestsByFirstContract({
    nodes: axisLayoutedScopedNodes,
    edges: scopedEdges,
    firstContractId: axisFirstContract?.id ?? null,
  });
  const requestPositionsById = buildRequestPositionsById({
    contract: axisFirstContract,
    requests,
  });
  const requestNodes = collectNodesByPredicate(
    axisLayoutedScopedNodes,
    isFulfillmentRequestNode,
  );
  const spreadRequestPositionsById = spreadColumnNodesById({
    basePositionsById: requestPositionsById,
    defaultX: DEFAULT_REQUEST_COLUMN_X,
    nodeById,
    nodeIds: requestNodes.map((node) => node.id),
  });
  const confirmationByRequestId = collectConfirmationByRequestId(
    axisLayoutedScopedNodes,
    scopedEdges,
  );
  const confirmationPositionsById = buildConfirmationPositionsById({
    confirmationByRequestId,
    nodeById,
    requestPositionsById: spreadRequestPositionsById,
  });
  const otherEvidenceByConfirmationId = collectOtherEvidenceByConfirmationId(
    axisLayoutedScopedNodes,
    scopedEdges,
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
    const axisLayoutedNodes = applyPositionsById(
      nodes,
      new Map(axisLayoutedScopedNodes.map((node) => [node.id, node.position])),
    );
    return applyContextSizeById({
      contextId: firstContract.parentId,
      nodes: axisLayoutedNodes,
    });
  }

  const scopedLayoutedNodes = applyPositionsById(axisLayoutedScopedNodes, positionsById);
  const scopedPositionById = new Map(
    scopedLayoutedNodes.map((node) => [node.id, node.position]),
  );
  const layoutedNodes = applyPositionsById(nodes, scopedPositionById);
  return applyContextSizeById({
    contextId: firstContract.parentId,
    nodes: layoutedNodes,
  });
}
