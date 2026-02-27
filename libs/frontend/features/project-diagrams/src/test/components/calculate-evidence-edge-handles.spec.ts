import { LogicalEntity } from '@shared/schema';
import { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  calculateEvidenceEdgeHandles,
  EVIDENCE_SOURCE_HANDLE_RIGHT,
  EVIDENCE_TARGET_HANDLE_LEFT,
} from '../../lib/components/calculate-evidence-edge-handles';
import nodes from '../fixture/nodes.json' with { type: 'json' };
import edges from '../fixture/edges.json' with { type: 'json' };

type LNode = Node<LogicalEntity['data']>;
type LEdge = Edge;
const FIXTURE_NODES = nodes as LNode[];
const FIXTURE_EDGES = edges as LEdge[];

describe('calculateEvidenceEdgeHandles', () => {
  it('connects evidence->evidence edges from source right to target left', () => {
    const nextEdges = calculateEvidenceEdgeHandles(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeById = new Map(FIXTURE_NODES.map((node) => [node.id, node] as const));

    for (const edge of nextEdges) {
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      const isEvidenceToEvidence =
        sourceNode?.data.type === 'EVIDENCE' && targetNode?.data.type === 'EVIDENCE';

      if (!isEvidenceToEvidence) {
        expect(edge.sourceHandle).toBeUndefined();
        expect(edge.targetHandle).toBeUndefined();
        continue;
      }

      expect(edge.sourceHandle).toBe(EVIDENCE_SOURCE_HANDLE_RIGHT);
      expect(edge.targetHandle).toBe(EVIDENCE_TARGET_HANDLE_LEFT);
    }
  });
});
