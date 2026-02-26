import { LogicalEntity } from '@shared/schema';
import { Node } from '@xyflow/react';

type DiagramNode = Node<LogicalEntity['data']>;
type Position = { x: number; y: number };

export const LAYOUT_NODE_WIDTH = 160;
export const LAYOUT_NODE_HEIGHT = 80;
export const LAYOUT_GAP_X = 80;
export const LAYOUT_GAP_Y = 40;
export const LAYOUT_START_X = 120;
export const LAYOUT_AXIS_Y = 240;
const ROOT_PARENT_KEY = '__root__';

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

function getParentKey(node: DiagramNode): string {
  return node.parentId ?? ROOT_PARENT_KEY;
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

function collectRequestGroups(
  nodes: DiagramNode[],
): {
  contractByParentKey: Map<string, DiagramNode>;
  requestsByParentKey: Map<string, DiagramNode[]>;
  fallbackContract: DiagramNode | undefined;
} {
  const contractByParentKey = new Map<string, DiagramNode>();
  const requestsByParentKey = new Map<string, DiagramNode[]>();
  let fallbackContract: DiagramNode | undefined;

  for (const node of nodes) {
    const parentKey = getParentKey(node);
    if (isContractNode(node)) {
      if (!contractByParentKey.has(parentKey)) {
        contractByParentKey.set(parentKey, node);
      }
      fallbackContract ??= node;
      continue;
    }

    if (isFulfillmentRequestNode(node)) {
      const requests = requestsByParentKey.get(parentKey) ?? [];
      requests.push(node);
      requestsByParentKey.set(parentKey, requests);
    }
  }

  return { contractByParentKey, requestsByParentKey, fallbackContract };
}

function buildRequestPositionsById(params: {
  contractByParentKey: Map<string, DiagramNode>;
  requestsByParentKey: Map<string, DiagramNode[]>;
  fallbackContract: DiagramNode | undefined;
}): Map<string, Position> {
  const {
    contractByParentKey,
    requestsByParentKey,
    fallbackContract,
  } = params;
  const requestPositionsById = new Map<string, Position>();
  for (const [parentKey, requests] of requestsByParentKey.entries()) {
    const contract = contractByParentKey.get(parentKey) ?? fallbackContract;
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

export function calculateLayout(nodes: DiagramNode[]): DiagramNode[] {
  const axisLayoutedNodes = layoutEvidenceAxis(nodes);
  const requestGroups = collectRequestGroups(axisLayoutedNodes);
  if (requestGroups.requestsByParentKey.size === 0) {
    return axisLayoutedNodes;
  }

  const requestPositionsById = buildRequestPositionsById(requestGroups);
  return applyRequestPositions(axisLayoutedNodes, requestPositionsById);
}
