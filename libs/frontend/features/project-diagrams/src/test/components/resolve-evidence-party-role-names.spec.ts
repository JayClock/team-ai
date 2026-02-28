import { LogicalEntity } from '@shared/schema';
import { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { resolveEvidencePartyRoleName } from '../../lib/components/resolve-evidence-party-role-names';
import nodes from '../fixture/nodes.json' with { type: 'json' };
import edges from '../fixture/edges.json' with { type: 'json' };

type LNode = Node<LogicalEntity['data']>;
type LEdge = Pick<Edge, 'source' | 'target'>;
const FIXTURE_NODES = nodes as LNode[];
const FIXTURE_EDGES = edges as LEdge[];

describe('resolveEvidencePartyRoleName', () => {
  it('returns single party_role name for non-contract evidence and excludes contract', () => {
    expect(
      resolveEvidencePartyRoleName({
        edges: FIXTURE_EDGES,
        evidenceNodeId: 'node-5',
        nodes: FIXTURE_NODES,
      }),
    ).toBe('买家');

    expect(
      resolveEvidencePartyRoleName({
        edges: FIXTURE_EDGES,
        evidenceNodeId: 'node-16',
        nodes: FIXTURE_NODES,
      }),
    ).toBe('寄件人');

    expect(
      resolveEvidencePartyRoleName({
        edges: FIXTURE_EDGES,
        evidenceNodeId: 'node-24',
        nodes: FIXTURE_NODES,
      }),
    ).toBe('付款人');

    expect(
      resolveEvidencePartyRoleName({
        edges: FIXTURE_EDGES,
        evidenceNodeId: 'node-2',
        nodes: FIXTURE_NODES,
      }),
    ).toBeNull();
  });
});
