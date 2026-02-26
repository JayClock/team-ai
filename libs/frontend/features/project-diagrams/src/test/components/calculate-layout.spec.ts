import { LogicalEntity } from '@shared/schema';
import { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  calculateLayout,
  LAYOUT_AXIS_Y,
  LAYOUT_GAP_X,
  LAYOUT_GAP_Y,
  LAYOUT_NODE_HEIGHT,
  LAYOUT_NODE_WIDTH,
  LAYOUT_START_X,
} from '../../lib/components/calculate-layout';
import nodes from '../fixture/nodes.json' with { type: 'json' };
import edges from '../fixture/edges.json' with { type: 'json' };

type LNode = Node<LogicalEntity['data']>;
type LEdge = Pick<Edge, 'id' | 'source' | 'target'>;
const CONTRACT_ID = 'node-7';
const RFP_ID = 'node-5';
const PROPOSAL_ID = 'node-6';
const REQUEST_IDS = ['node-8', 'node-10', 'node-12'] as const;
const FIXTURE_NODES = nodes as LNode[];
const FIXTURE_EDGES = edges as LEdge[];
const CONTRACT_ANCHOR_X = LAYOUT_START_X + 2 * (LAYOUT_NODE_WIDTH + LAYOUT_GAP_X);

function toNodeMap(list: LNode[]): Map<string, LNode> {
  return new Map(list.map((node) => [node.id, node] as const));
}

describe('calculateLayout - fulfillment axis', () => {
  it('uses a single contract as central anchor', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    const contract = nodeMap.get(CONTRACT_ID);

    expect(contract?.position.x).toBe(CONTRACT_ANCHOR_X);
    expect(contract?.position.y).toBe(LAYOUT_AXIS_Y);
  });

  it('keeps rfp -> proposal -> contract on the same central axis', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    const rfp = nodeMap.get(RFP_ID);
    const proposal = nodeMap.get(PROPOSAL_ID);
    const contract = nodeMap.get(CONTRACT_ID);

    expect(rfp?.position.y).toBe(LAYOUT_AXIS_Y);
    expect(proposal?.position.y).toBe(LAYOUT_AXIS_Y);
    expect(contract?.position.y).toBe(LAYOUT_AXIS_Y);

    expect((rfp?.position.x ?? 0) < (proposal?.position.x ?? 0)).toBe(true);
    expect((proposal?.position.x ?? 0) < (contract?.position.x ?? 0)).toBe(true);
  });

  it('places fulfillment requests to the right of contract from top to bottom', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    const contract = nodeMap.get(CONTRACT_ID);
    const requests = REQUEST_IDS
      .map((id) => nodeMap.get(id))
      .filter((node): node is LNode => Boolean(node));
    const requestX = (contract?.position.x ?? 0) + LAYOUT_NODE_WIDTH + LAYOUT_GAP_X;
    const requestStepY = LAYOUT_NODE_HEIGHT + LAYOUT_GAP_Y;
    const sortedByY = [...requests].sort((a, b) => a.position.y - b.position.y);

    expect(sortedByY.length).toBeGreaterThan(0);

    for (const request of sortedByY) {
      expect(request.position.x).toBe(requestX);
    }

    const expectedStartY =
      (contract?.position.y ?? 0) - ((sortedByY.length - 1) * requestStepY) / 2;
    expect(sortedByY[0].position.y).toBe(expectedStartY);

    for (let index = 0; index < sortedByY.length - 1; index += 1) {
      expect(sortedByY[index].position.y).toBeLessThan(sortedByY[index + 1].position.y);
      expect(sortedByY[index + 1].position.y - sortedByY[index].position.y).toBe(requestStepY);
    }

    const topEdgeY = sortedByY[0].position.y - LAYOUT_NODE_HEIGHT / 2;
    const bottomEdgeY =
      sortedByY[sortedByY.length - 1].position.y + LAYOUT_NODE_HEIGHT / 2;
    expect((topEdgeY + bottomEdgeY) / 2).toBe(contract?.position.y);
  });
});
