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
export const CONTEXT_LAYOUT_GAP_X = 80;
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

function isEvidenceAsRoleNode(node: DiagramNode): boolean {
  return node.data.type === 'ROLE' && node.data.subType === 'evidence_role';
}

function isContextNode(node: DiagramNode): boolean {
  return node.data.type === 'CONTEXT';
}

function isConfirmationRightNode(node: DiagramNode): boolean {
  return isOtherEvidenceNode(node) || isEvidenceAsRoleNode(node);
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

function collectRequestsByContract(params: {
  edges: DiagramEdge[];
  contractId: string | null;
  nodes: DiagramNode[];
}): DiagramNode[] {
  const { nodes, edges, contractId } = params;
  if (!contractId) {
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

    if (match.contract.id !== contractId) {
      continue;
    }

    if (!requests.some((request) => request.id === match.request.id)) {
      requests.push(match.request);
    }
  }

  return requests;
}

function collectContractRolesByContract(params: {
  edges: DiagramEdge[];
  contractId: string | null;
  nodes: DiagramNode[];
}): DiagramNode[] {
  const { nodes, edges, contractId } = params;
  if (!contractId) {
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

    if (match.contract.id !== contractId) {
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

function collectConfirmationRightNodesByConfirmationId(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): Map<string, DiagramNode[]> {
  const nodeById = buildNodeById(nodes);
  const confirmationRightNodesByConfirmationId = new Map<string, DiagramNode[]>();

  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) {
      continue;
    }

    const match =
      isFulfillmentConfirmationNode(sourceNode) && isConfirmationRightNode(targetNode)
        ? { confirmation: sourceNode, node: targetNode }
        : isFulfillmentConfirmationNode(targetNode) && isConfirmationRightNode(sourceNode)
          ? { confirmation: targetNode, node: sourceNode }
          : null;
    if (!match) {
      continue;
    }

    const confirmationRightNodes =
      confirmationRightNodesByConfirmationId.get(match.confirmation.id) ?? [];
    if (!confirmationRightNodes.some((node) => node.id === match.node.id)) {
      confirmationRightNodes.push(match.node);
    }
    confirmationRightNodesByConfirmationId.set(
      match.confirmation.id,
      confirmationRightNodes,
    );
  }

  return confirmationRightNodesByConfirmationId;
}

function buildConfirmationRightNodePositionsById(params: {
  confirmationPositionsById: Map<string, Position>;
  confirmationRightNodesByConfirmationId: Map<string, DiagramNode[]>;
  nodeById: Map<string, DiagramNode>;
}): Map<string, Position> {
  const { confirmationPositionsById, confirmationRightNodesByConfirmationId, nodeById } =
    params;
  const confirmationRightNodePositionsById = new Map<string, Position>();

  for (const [confirmationId, confirmationRightNodes] of confirmationRightNodesByConfirmationId.entries()) {
    if (confirmationRightNodes.length === 0) {
      continue;
    }
    const confirmationPosition =
      confirmationPositionsById.get(confirmationId) ??
      nodeById.get(confirmationId)?.position;
    if (!confirmationPosition) {
      continue;
    }

    const rightColumnX = confirmationPosition.x + LAYOUT_NODE_WIDTH + LAYOUT_GAP_X;
    const rightNodeStepY = LAYOUT_NODE_HEIGHT + LAYOUT_GAP_Y;
    const totalRightNodesHeight =
      confirmationRightNodes.length * LAYOUT_NODE_HEIGHT +
      (confirmationRightNodes.length - 1) * LAYOUT_GAP_Y;
    const rightNodesTopY = confirmationPosition.y - totalRightNodesHeight / 2;
    const rightNodeStartY = rightNodesTopY + LAYOUT_NODE_HEIGHT / 2;

    confirmationRightNodes.forEach((rightNode, index) => {
      confirmationRightNodePositionsById.set(rightNode.id, {
        x: rightColumnX,
        y: rightNodeStartY + index * rightNodeStepY,
      });
    });
  }

  return confirmationRightNodePositionsById;
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

function collectContextScopedNodes(params: {
  contextId: string | undefined;
  nodes: DiagramNode[];
}): DiagramNode[] {
  const { contextId, nodes } = params;
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
    const left = childNode.position.x;
    const right = childNode.position.x + width;
    const top = childNode.position.y;
    const bottom = childNode.position.y + height;
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);
    minY = Math.min(minY, top);
    maxY = Math.max(maxY, bottom);
  }

  const widthCompensation = Math.max(CONTEXT_LAYOUT_PADDING_X - minX, 0);
  const heightCompensation = Math.max(CONTEXT_LAYOUT_PADDING_Y - minY, 0);
  const computedWidth = Math.ceil(
    maxX + CONTEXT_LAYOUT_PADDING_X + widthCompensation,
  );
  const computedHeight = Math.ceil(
    maxY + CONTEXT_LAYOUT_PADDING_Y + heightCompensation,
  );
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

function applyContextHorizontalLayoutByNodeOrder(params: {
  contextIds: Set<string>;
  nodes: DiagramNode[];
}): DiagramNode[] {
  const { contextIds, nodes } = params;
  if (contextIds.size <= 1) {
    return nodes;
  }

  const orderedContextNodes = nodes.filter(
    (node) => isContextNode(node) && contextIds.has(node.id),
  );
  if (orderedContextNodes.length <= 1) {
    return nodes;
  }

  let currentX = orderedContextNodes[0].position.x;
  const baseY = orderedContextNodes[0].position.y;
  const contextPositionById = new Map<string, Position>();
  for (const contextNode of orderedContextNodes) {
    contextPositionById.set(contextNode.id, { x: currentX, y: baseY });
    currentX += getNodeWidth(contextNode) + CONTEXT_LAYOUT_GAP_X;
  }

  return applyPositionsById(nodes, contextPositionById);
}

export function calculateLayout(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): DiagramNode[] {
  const axisLayoutedNodes = layoutEvidenceAxis(nodes);
  const contracts = collectNodesByPredicate(axisLayoutedNodes, isContractNode);
  if (contracts.length === 0) {
    return axisLayoutedNodes;
  }

  const positionsById = new Map<string, Position>();
  const contextIds = new Set<string>();

  for (const contract of contracts) {
    const scopedNodes = collectContextScopedNodes({
      contextId: contract.parentId,
      nodes: axisLayoutedNodes,
    });
    const scopedNodeIds = new Set(scopedNodes.map((node) => node.id));
    const scopedEdges = collectScopedEdges({ edges, scopedNodeIds });
    const nodeById = buildNodeById(scopedNodes);

    const roles = collectContractRolesByContract({
      nodes: scopedNodes,
      edges: scopedEdges,
      contractId: contract.id,
    });
    const contractRolePositionsById = buildContractRolePositionsById({
      contract,
      roles,
    });
    for (const [id, position] of contractRolePositionsById.entries()) {
      positionsById.set(id, position);
    }

    const requests = collectRequestsByContract({
      nodes: scopedNodes,
      edges: scopedEdges,
      contractId: contract.id,
    });
    const requestPositionsById = buildRequestPositionsById({
      contract,
      requests,
    });
    const spreadRequestPositionsById = spreadColumnNodesById({
      basePositionsById: requestPositionsById,
      defaultX: DEFAULT_REQUEST_COLUMN_X,
      nodeById,
      nodeIds: requests.map((node) => node.id),
    });
    for (const [id, position] of spreadRequestPositionsById.entries()) {
      positionsById.set(id, position);
    }

    const requestIds = new Set(requests.map((request) => request.id));
    const confirmationByRequestId = collectConfirmationByRequestId(scopedNodes, scopedEdges);
    const scopedConfirmationByRequestId = new Map(
      [...confirmationByRequestId.entries()].filter(([requestId]) =>
        requestIds.has(requestId),
      ),
    );
    const confirmationPositionsById = buildConfirmationPositionsById({
      confirmationByRequestId: scopedConfirmationByRequestId,
      nodeById,
      requestPositionsById: spreadRequestPositionsById,
    });
    for (const [id, position] of confirmationPositionsById.entries()) {
      positionsById.set(id, position);
    }

    const confirmationIds = new Set(
      [...scopedConfirmationByRequestId.values()].map((node) => node.id),
    );
    const confirmationRightNodesByConfirmationId = collectConfirmationRightNodesByConfirmationId(
      scopedNodes,
      scopedEdges,
    );
    const scopedConfirmationRightNodesByConfirmationId = new Map(
      [...confirmationRightNodesByConfirmationId.entries()].filter(([confirmationId]) =>
        confirmationIds.has(confirmationId),
      ),
    );
    const confirmationRightNodePositionsById = buildConfirmationRightNodePositionsById({
      confirmationPositionsById,
      nodeById,
      confirmationRightNodesByConfirmationId: scopedConfirmationRightNodesByConfirmationId,
    });
    const confirmationRightNodeIds = [
      ...new Set(
        [...scopedConfirmationRightNodesByConfirmationId.values()].flatMap((connectedNodes) =>
          connectedNodes.map((node) => node.id),
        ),
      ),
    ];
    const spreadConfirmationRightNodePositionsById = spreadColumnNodesById({
      basePositionsById: confirmationRightNodePositionsById,
      defaultX: DEFAULT_REQUEST_COLUMN_X + 2 * COLUMN_STEP_X,
      nodeById,
      nodeIds: confirmationRightNodeIds,
    });
    for (const [id, position] of spreadConfirmationRightNodePositionsById.entries()) {
      positionsById.set(id, position);
    }

    if (contract.parentId) {
      contextIds.add(contract.parentId);
    }
  }

  const layoutedNodes = applyPositionsById(axisLayoutedNodes, positionsById);
  let sizedNodes = layoutedNodes;
  for (const contextId of contextIds) {
    sizedNodes = applyContextSizeById({
      contextId,
      nodes: sizedNodes,
    });
  }

  return applyContextHorizontalLayoutByNodeOrder({
    contextIds,
    nodes: sizedNodes,
  });
}
