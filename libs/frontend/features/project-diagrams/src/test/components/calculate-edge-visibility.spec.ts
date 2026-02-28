import { LogicalEntity } from '@shared/schema';
import { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { calculateEdgeVisibility } from '../../lib/components/calculate-edge-visibility';
import nodes from '../fixture/nodes.json' with { type: 'json' };
import edges from '../fixture/edges.json' with { type: 'json' };

type LNode = Node<LogicalEntity['data']>;
type LEdge = Edge;
const FIXTURE_NODES = nodes as LNode[];
const FIXTURE_EDGES = edges as LEdge[];

describe('calculateEdgeVisibility', () => {
  it('only applies to party_role <-> evidence edges and excludes contract', () => {
    const nodeById = new Map(FIXTURE_NODES.map((node) => [node.id, node] as const));
    const edgesWithOverrides = FIXTURE_EDGES.map((edge) => {
      if (edge.id === 'generated:node-3::node-2') {
        return { ...edge, hidden: true };
      }
      if (edge.id === 'generated:node-3::node-5') {
        return { ...edge, hidden: false };
      }
      if (edge.id === 'generated:node-5::node-6') {
        return { ...edge, hidden: true };
      }
      return edge;
    });
    const inputEdgeById = new Map(
      edgesWithOverrides.map((edge) => [edge.id, edge] as const),
    );

    const nextEdges = calculateEdgeVisibility(FIXTURE_NODES, edgesWithOverrides);
    const edgeById = new Map(nextEdges.map((edge) => [edge.id, edge] as const));

    for (const edge of nextEdges) {
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      const isSourcePartyRole =
        sourceNode?.data.type === 'ROLE' && sourceNode.data.subType === 'party_role';
      const isTargetPartyRole =
        targetNode?.data.type === 'ROLE' && targetNode.data.subType === 'party_role';
      if (!isSourcePartyRole && !isTargetPartyRole) {
        continue;
      }

      const connectedNode = isSourcePartyRole ? targetNode : sourceNode;
      if (!connectedNode || connectedNode.data.type !== 'EVIDENCE') {
        expect(edge.hidden).toBe(inputEdgeById.get(edge.id)?.hidden);
        continue;
      }

      expect(edge.hidden).toBe(connectedNode.data.subType !== 'contract');
    }

    expect(edgeById.get('generated:node-3::node-2')?.hidden).toBe(false);
    expect(edgeById.get('generated:node-3::node-5')?.hidden).toBe(true);
    expect(edgeById.get('generated:node-4::node-7')?.hidden).toBe(true);
    expect(edgeById.get('generated:node-5::node-6')?.hidden).toBe(true);
  });
});
