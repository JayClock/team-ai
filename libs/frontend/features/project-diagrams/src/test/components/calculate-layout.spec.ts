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
const PARTY_ROLE_IDS = ['node-8', 'node-9'] as const;
const PARTY_BY_PARTY_ROLE_ID = {
  'node-8': 'node-2',
  'node-9': 'node-3',
} as const;
const REQUEST_IDS = ['node-11', 'node-16', 'node-21'] as const;
const CONFIRM_BY_REQUEST_ID = {
  'node-11': 'node-12',
  'node-16': 'node-17',
  'node-21': 'node-22',
} as const;
const OTHER_EVIDENCE_BY_CONFIRM_ID = {
  'node-12': 'node-15',
  'node-17': 'node-20',
} as const;
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

  it('places contract roles above and below contract on the same column', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    const contract = nodeMap.get(CONTRACT_ID);
    const roles = PARTY_ROLE_IDS
      .map((id) => nodeMap.get(id))
      .filter((node): node is LNode => Boolean(node))
      .sort((a, b) => a.position.y - b.position.y);
    const roleStepY = LAYOUT_NODE_HEIGHT + LAYOUT_GAP_Y;

    expect(roles).toHaveLength(2);
    expect(contract).toBeDefined();

    for (const role of roles) {
      expect(role.position.x).toBe(contract?.position.x);
    }

    expect(roles[0].position.y).toBe((contract?.position.y ?? 0) - roleStepY);
    expect(roles[1].position.y).toBe((contract?.position.y ?? 0) + roleStepY);
  });

  it('extends contract party_role to its corresponding PARTY in same direction', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    const contract = nodeMap.get(CONTRACT_ID);
    const stepY = LAYOUT_NODE_HEIGHT + LAYOUT_GAP_Y;

    expect(contract).toBeDefined();

    for (const roleId of PARTY_ROLE_IDS) {
      const partyId = PARTY_BY_PARTY_ROLE_ID[roleId];
      const role = nodeMap.get(roleId);
      const party = nodeMap.get(partyId);
      const isRoleAboveContract = (role?.position.y ?? 0) < (contract?.position.y ?? 0);

      expect(role).toBeDefined();
      expect(party).toBeDefined();
      expect(party?.position.x).toBe(role?.position.x);
      expect(party?.position.y).toBe(
        isRoleAboveContract
          ? (role?.position.y ?? 0) - stepY
          : (role?.position.y ?? 0) + stepY,
      );
    }
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

  it('places each fulfillment_confirmation to the right of request on same row', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    for (const requestId of REQUEST_IDS) {
      const confirmId = CONFIRM_BY_REQUEST_ID[requestId];
      const request = nodeMap.get(requestId);
      const confirm = nodeMap.get(confirmId);
      expect(request).toBeDefined();
      expect(confirm).toBeDefined();
      expect(confirm?.position.x).toBe(
        (request?.position.x ?? 0) + LAYOUT_NODE_WIDTH + LAYOUT_GAP_X,
      );
      expect(confirm?.position.y).toBe(request?.position.y);
    }
  });

  it('places other_evidence to the right of fulfillment_confirmation on same row', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    for (const [confirmId, otherEvidenceId] of Object.entries(
      OTHER_EVIDENCE_BY_CONFIRM_ID,
    )) {
      const confirm = nodeMap.get(confirmId);
      const otherEvidence = nodeMap.get(otherEvidenceId);
      expect(confirm).toBeDefined();
      expect(otherEvidence).toBeDefined();
      expect(otherEvidence?.position.x).toBe(
        (confirm?.position.x ?? 0) + LAYOUT_NODE_WIDTH + LAYOUT_GAP_X,
      );
      expect(otherEvidence?.position.y).toBe(confirm?.position.y);
    }
  });

  it('spreads request/confirmation/other_evidence columns to avoid vertical overlap', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    const requestNodes = [...REQUEST_IDS]
      .map((id) => nodeMap.get(id))
      .filter((node): node is LNode => Boolean(node))
      .sort((a, b) => a.position.y - b.position.y);
    const confirmationNodes = Object.values(CONFIRM_BY_REQUEST_ID)
      .map((id) => nodeMap.get(id))
      .filter((node): node is LNode => Boolean(node))
      .sort((a, b) => a.position.y - b.position.y);
    const evidenceNodes = Object.values(OTHER_EVIDENCE_BY_CONFIRM_ID)
      .map((id) => nodeMap.get(id))
      .filter((node): node is LNode => Boolean(node))
      .sort((a, b) => a.position.y - b.position.y);
    const verticalStep = LAYOUT_NODE_HEIGHT + LAYOUT_GAP_Y;
    const requestX = LAYOUT_START_X + 3 * (LAYOUT_NODE_WIDTH + LAYOUT_GAP_X);
    const confirmX = requestX + LAYOUT_NODE_WIDTH + LAYOUT_GAP_X;
    const evidenceX = confirmX + LAYOUT_NODE_WIDTH + LAYOUT_GAP_X;

    expect(requestNodes).toHaveLength(REQUEST_IDS.length);
    expect(confirmationNodes).toHaveLength(Object.keys(CONFIRM_BY_REQUEST_ID).length);
    expect(evidenceNodes).toHaveLength(
      Object.keys(OTHER_EVIDENCE_BY_CONFIRM_ID).length,
    );

    for (const requestNode of requestNodes) {
      expect(requestNode.position.x).toBe(requestX);
    }

    for (const confirmationNode of confirmationNodes) {
      expect(confirmationNode.position.x).toBe(confirmX);
    }

    for (const evidenceNode of evidenceNodes) {
      expect(evidenceNode.position.x).toBe(evidenceX);
    }

    for (let index = 0; index < requestNodes.length - 1; index += 1) {
      expect(requestNodes[index + 1].position.y - requestNodes[index].position.y).toBeGreaterThanOrEqual(
        verticalStep,
      );
    }

    for (let index = 0; index < confirmationNodes.length - 1; index += 1) {
      expect(
        confirmationNodes[index + 1].position.y - confirmationNodes[index].position.y,
      ).toBeGreaterThanOrEqual(verticalStep);
    }

    for (let index = 0; index < evidenceNodes.length - 1; index += 1) {
      expect(evidenceNodes[index + 1].position.y - evidenceNodes[index].position.y).toBeGreaterThanOrEqual(
        verticalStep,
      );
    }
  });
});
