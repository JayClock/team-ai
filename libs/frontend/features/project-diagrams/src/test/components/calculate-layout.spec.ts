import { LogicalEntity } from '@shared/schema';
import { Node } from '@xyflow/react';
import { beforeAll, describe, expect, it } from 'vitest';
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

type LNode = Node<LogicalEntity['data']>;

const CONTRACT_INDEX = 2;

const CONTRACT_ANCHOR_X =
  LAYOUT_START_X + CONTRACT_INDEX * (LAYOUT_NODE_WIDTH + LAYOUT_GAP_X);
const CONTRACT_ANCHOR_Y = LAYOUT_AXIS_Y;

function getEvidenceBySubType(list: LNode[], subType: LogicalEntity['data']['subType']): LNode[] {
  return list.filter(
    (node) => node.data.type === 'EVIDENCE' && node.data.subType === subType,
  );
}

function getSingleEvidenceBySubType(list: LNode[], subType: LogicalEntity['data']['subType']): LNode {
  const matched = getEvidenceBySubType(list, subType);
  if (matched.length !== 1) {
    throw new Error(`Expected exactly one EVIDENCE:${subType}, got ${matched.length}`);
  }
  return matched[0];
}

describe('calculateLayout - fulfillment axis', () => {
  let layoutedNodes: LNode[] = [];

  beforeAll(() => {
    layoutedNodes = calculateLayout(nodes as LNode[]);
  });

  it('uses a single contract as central anchor', () => {
    const contract = getSingleEvidenceBySubType(layoutedNodes, 'contract');

    expect(contract.position.x).toBe(CONTRACT_ANCHOR_X);
    expect(contract.position.y).toBe(CONTRACT_ANCHOR_Y);
  });

  it('keeps rfp -> proposal -> contract on the same central axis', () => {
    const rfp = getSingleEvidenceBySubType(layoutedNodes, 'rfp');
    const proposal = getSingleEvidenceBySubType(layoutedNodes, 'proposal');
    const contract = getSingleEvidenceBySubType(layoutedNodes, 'contract');

    expect(rfp.position.y).toBe(CONTRACT_ANCHOR_Y);
    expect(proposal.position.y).toBe(CONTRACT_ANCHOR_Y);
    expect(contract.position.y).toBe(CONTRACT_ANCHOR_Y);

    expect(rfp.position.x).toBeLessThan(proposal.position.x);
    expect(proposal.position.x).toBeLessThan(contract.position.x);
  });

  it('places fulfillment requests to the right of contract from top to bottom', () => {
    const contract = getSingleEvidenceBySubType(layoutedNodes, 'contract');
    const requests = getEvidenceBySubType(layoutedNodes, 'fulfillment_request');
    const requestX = contract.position.x + LAYOUT_NODE_WIDTH + LAYOUT_GAP_X;
    const requestStepY = LAYOUT_NODE_HEIGHT + LAYOUT_GAP_Y;
    const sortedByY = [...requests].sort((a, b) => a.position.y - b.position.y);

    expect(sortedByY.length).toBeGreaterThan(0);

    for (const request of sortedByY) {
      expect(request.position.x).toBe(requestX);
    }

    const expectedStartY =
      contract.position.y - ((sortedByY.length - 1) * requestStepY) / 2;
    expect(sortedByY[0].position.y).toBe(expectedStartY);

    for (let index = 0; index < sortedByY.length - 1; index += 1) {
      expect(sortedByY[index].position.y).toBeLessThan(sortedByY[index + 1].position.y);
      expect(sortedByY[index + 1].position.y - sortedByY[index].position.y).toBe(requestStepY);
    }

    const topEdgeY = sortedByY[0].position.y - LAYOUT_NODE_HEIGHT / 2;
    const bottomEdgeY =
      sortedByY[sortedByY.length - 1].position.y + LAYOUT_NODE_HEIGHT / 2;
    expect((topEdgeY + bottomEdgeY) / 2).toBe(contract.position.y);
  });
});
