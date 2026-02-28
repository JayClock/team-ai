import { LogicalEntity } from '@shared/schema';
import { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { calculateLayout } from '../../lib/components/calculate-layout';
import nodes from '../fixture/nodes.json' with { type: 'json' };
import edges from '../fixture/edges.json' with { type: 'json' };

type LNode = Node<LogicalEntity['data']>;
type LEdge = Pick<Edge, 'id' | 'source' | 'target'>;
const CONTRACT_ID = 'node-7';
const CONTRACT_CONTEXT_ID = 'node-1';
const RFP_ID = 'node-5';
const PROPOSAL_ID = 'node-6';
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
    expectNodePosition(nodeMap, RFP_ID, { x: 120, y: 240 });
    expectNodePosition(nodeMap, PROPOSAL_ID, { x: 360, y: 240 });
    expectNodePosition(nodeMap, CONTRACT_ID, { x: 600, y: 240 });
  });

  it('places contract roles above and below contract on the same column', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    expectNodePosition(nodeMap, 'node-8', { x: 600, y: 120 });
    expectNodePosition(nodeMap, 'node-9', { x: 600, y: 360 });
  });

  it('places fulfillment requests to the right of contract from top to bottom', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    expectNodePosition(nodeMap, 'node-11', { x: 840, y: 120 });
    expectNodePosition(nodeMap, 'node-16', { x: 840, y: 240 });
    expectNodePosition(nodeMap, 'node-21', { x: 840, y: 360 });
  });

  it('places each fulfillment_confirmation to the right of request on same row', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    expectNodePosition(nodeMap, 'node-12', { x: 1080, y: 120 });
    expectNodePosition(nodeMap, 'node-17', { x: 1080, y: 240 });
    expectNodePosition(nodeMap, 'node-22', { x: 1080, y: 360 });
  });

  it('keeps other_evidence outside first contract context unchanged', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    expectNodePosition(nodeMap, 'node-15', { x: 0, y: 0 });
    expectNodePosition(nodeMap, 'node-20', { x: 0, y: 0 });
  });

  it('spreads request/confirmation columns and skips out-of-context evidence layout', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    expectNodePosition(nodeMap, 'node-11', { x: 840, y: 120 });
    expectNodePosition(nodeMap, 'node-16', { x: 840, y: 240 });
    expectNodePosition(nodeMap, 'node-21', { x: 840, y: 360 });
    expectNodePosition(nodeMap, 'node-12', { x: 1080, y: 120 });
    expectNodePosition(nodeMap, 'node-17', { x: 1080, y: 240 });
    expectNodePosition(nodeMap, 'node-22', { x: 1080, y: 360 });
    expectNodePosition(nodeMap, 'node-15', { x: 0, y: 0 });
    expectNodePosition(nodeMap, 'node-20', { x: 0, y: 0 });
  });

  it('calculates first contract context width and height from child bounds', () => {
    const layoutedNodes = calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    const contextNode = nodeMap.get(CONTRACT_CONTEXT_ID);

    expect(contextNode).toBeDefined();
    expect(contextNode?.width).toBe(1400);
    expect(contextNode?.height).toBe(600);
  });
});
