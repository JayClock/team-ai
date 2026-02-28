import { LogicalEntity } from '@shared/schema';
import { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  calculateLayout,
  CONTEXT_LAYOUT_GAP_X,
} from '../../lib/components/calculate-layout';
import nodes from '../fixture/nodes.json' with { type: 'json' };
import edges from '../fixture/edges.json' with { type: 'json' };

type LNode = Node<LogicalEntity['data']>;
type LEdge = Pick<Edge, 'id' | 'source' | 'target'>;
const CONTRACT_ID = 'node-2';
const CONTRACT_CONTEXT_ID = 'node-1';
const LOGISTICS_CONTEXT_ID = 'node-11';
const PAYMENT_CONTEXT_ID = 'node-19';
const REQUEST_1_ID = 'node-5';
const REQUEST_2_ID = 'node-7';
const CONFIRMATION_1_ID = 'node-6';
const CONFIRMATION_2_ID = 'node-8';
const CONTRACT_ROLE_1_ID = 'node-3';
const CONTRACT_ROLE_2_ID = 'node-4';
const OTHER_EVIDENCE_IN_CONTEXT_ID = 'node-9';
const EVIDENCE_AS_ROLE_IN_CONTEXT_ID = 'node-10';
const OUT_OF_CONTEXT_OTHER_EVIDENCE_1_ID = 'node-18';
const OUT_OF_CONTEXT_OTHER_EVIDENCE_2_ID = 'node-26';
const FIXTURE_NODES = nodes as LNode[];
const FIXTURE_EDGES = edges as LEdge[];

function toNodeMap(list: LNode[]): Map<string, LNode> {
  return new Map(list.map((node) => [node.id, node] as const));
}

function expectNodePosition(
  nodeMap: Map<string, LNode>,
  nodeId: string,
  position: { x: number; y: number },
): void {
  const node = nodeMap.get(nodeId);
  expect(node).toBeDefined();
  expect(node?.position.x).toBe(position.x);
  expect(node?.position.y).toBe(position.y);
}

describe('calculateLayout - fulfillment axis', () => {
  it('uses a single contract as central anchor', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    expectNodePosition(nodeMap, CONTRACT_ID, { x: 600, y: 240 });
  });

  it('keeps rfp -> proposal -> contract on the same central axis', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    expectNodePosition(nodeMap, REQUEST_1_ID, { x: 840, y: 180 });
    expectNodePosition(nodeMap, CONFIRMATION_1_ID, { x: 1080, y: 180 });
    expectNodePosition(nodeMap, CONTRACT_ID, { x: 600, y: 240 });
  });

  it('places contract roles above and below contract on the same column', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    expectNodePosition(nodeMap, CONTRACT_ROLE_1_ID, { x: 600, y: 120 });
    expectNodePosition(nodeMap, CONTRACT_ROLE_2_ID, { x: 600, y: 360 });
  });

  it('places fulfillment requests to the right of contract from top to bottom', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    expectNodePosition(nodeMap, REQUEST_1_ID, { x: 840, y: 180 });
    expectNodePosition(nodeMap, REQUEST_2_ID, { x: 840, y: 300 });
  });

  it('places each fulfillment_confirmation to the right of request on same row', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    expectNodePosition(nodeMap, CONFIRMATION_1_ID, { x: 1080, y: 180 });
    expectNodePosition(nodeMap, CONFIRMATION_2_ID, { x: 1080, y: 300 });
  });

  it('lays out confirmation-connected other_evidence for every contract context', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    expectNodePosition(nodeMap, OTHER_EVIDENCE_IN_CONTEXT_ID, { x: 1320, y: 240 });
    expectNodePosition(nodeMap, OUT_OF_CONTEXT_OTHER_EVIDENCE_1_ID, { x: 1320, y: 240 });
    expectNodePosition(nodeMap, OUT_OF_CONTEXT_OTHER_EVIDENCE_2_ID, { x: 1320, y: 240 });
  });

  it('places other_evidence and evidence as role to the right of confirmation in order', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    expectNodePosition(nodeMap, CONFIRMATION_2_ID, { x: 1080, y: 300 });
    expectNodePosition(nodeMap, OTHER_EVIDENCE_IN_CONTEXT_ID, { x: 1320, y: 240 });
    expectNodePosition(nodeMap, EVIDENCE_AS_ROLE_IN_CONTEXT_ID, { x: 1320, y: 360 });
  });

  it('spreads request/confirmation columns and keeps all contract chains aligned', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    expectNodePosition(nodeMap, REQUEST_1_ID, { x: 840, y: 180 });
    expectNodePosition(nodeMap, REQUEST_2_ID, { x: 840, y: 300 });
    expectNodePosition(nodeMap, CONFIRMATION_1_ID, { x: 1080, y: 180 });
    expectNodePosition(nodeMap, CONFIRMATION_2_ID, { x: 1080, y: 300 });
    expectNodePosition(nodeMap, OTHER_EVIDENCE_IN_CONTEXT_ID, { x: 1320, y: 240 });
    expectNodePosition(nodeMap, EVIDENCE_AS_ROLE_IN_CONTEXT_ID, { x: 1320, y: 360 });
    expectNodePosition(nodeMap, OUT_OF_CONTEXT_OTHER_EVIDENCE_1_ID, { x: 1320, y: 240 });
    expectNodePosition(nodeMap, OUT_OF_CONTEXT_OTHER_EVIDENCE_2_ID, { x: 1320, y: 240 });
  });

  it('calculates first contract context width and height from child bounds', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    const contextNode = nodeMap.get(CONTRACT_CONTEXT_ID);

    expect(contextNode).toBeDefined();
    expect(contextNode?.width).toBe(1560);
    expect(contextNode?.height).toBe(520);
  });

  it('keeps context size large enough when mock nodes are shifted away from origin', () => {
    const localNodes = FIXTURE_NODES
      .filter((node) => node.id !== REQUEST_1_ID && node.id !== CONFIRMATION_1_ID)
      .map((node) =>
        node.parentId === CONTRACT_CONTEXT_ID
          ? {
            ...node,
            position: { x: 320, y: 220 },
          }
          : node,
      );

    const layoutedNodes = calculateLayout(localNodes, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    const contextNode = nodeMap.get(CONTRACT_CONTEXT_ID);

    expect(contextNode).toBeDefined();
    expect(contextNode?.width).toBe(1560);
    expect(contextNode?.height).toBe(520);
  });

  it('lays out contract contexts from left to right by node order', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    const contractContext = nodeMap.get(CONTRACT_CONTEXT_ID);
    const logisticsContext = nodeMap.get(LOGISTICS_CONTEXT_ID);
    const paymentContext = nodeMap.get(PAYMENT_CONTEXT_ID);

    expect(contractContext).toBeDefined();
    expect(logisticsContext).toBeDefined();
    expect(paymentContext).toBeDefined();

    expect(logisticsContext?.position.y).toBe(contractContext?.position.y);
    expect(paymentContext?.position.y).toBe(contractContext?.position.y);
    expect(logisticsContext?.position.x).toBe(
      (contractContext?.position.x ?? 0) +
      (contractContext?.width ?? 0) +
      CONTEXT_LAYOUT_GAP_X,
    );
    expect(paymentContext?.position.x).toBe(
      (logisticsContext?.position.x ?? 0) +
      (logisticsContext?.width ?? 0) +
      CONTEXT_LAYOUT_GAP_X,
    );
  });
});
