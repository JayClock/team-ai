import { DiagramEdge, DiagramNode } from '@shared/schema';
import { buildOptimisticDraftPreview, toNodeReferenceKeys } from './draft-utils';

function createDraftNode(id: string, name: string, label: string): DiagramNode['data'] {
  return {
    id,
    type: 'fulfillment-node',
    logicalEntity: null,
    parent: null,
    positionX: 120,
    positionY: 120,
    width: 220,
    height: 120,
    localData: {
      id: `entity-${id}`,
      type: 'EVIDENCE',
      subType: 'other_evidence',
      name,
      label,
      definition: {},
    },
  };
}

function createDraftEdge(sourceId: string, targetId: string): DiagramEdge['data'] {
  return {
    id: `${sourceId}->${targetId}`,
    sourceNode: { id: sourceId },
    targetNode: { id: targetId },
    sourceHandle: null,
    targetHandle: null,
    relationType: null,
    label: null,
    styleProps: null,
  };
}

describe('draft-utils', () => {
  it('should build optimistic ids from ai-provided node ids', () => {
    const draft = {
      nodes: [createDraftNode('node-alpha', 'Order', '订单'), createDraftNode('node-beta', 'User', '用户')],
      edges: [createDraftEdge('node-alpha', 'node-beta')],
    };

    const preview = buildOptimisticDraftPreview(draft);

    expect(preview.nodes[0].id).toBe('optimistic-node-alpha');
    expect(preview.nodes[1].id).toBe('optimistic-node-beta');
    expect(preview.edges[0].sourceNode.id).toBe('optimistic-node-alpha');
    expect(preview.edges[0].targetNode.id).toBe('optimistic-node-beta');
  });

  it('should drop edges that cannot resolve ai-provided node ids', () => {
    const draft = {
      nodes: [createDraftNode('custom-id', 'Order', '订单')],
      edges: [createDraftEdge('node-1', 'custom-id')],
    };

    const preview = buildOptimisticDraftPreview(draft);

    expect(preview.edges).toHaveLength(0);
  });

  it('should keep only explicit node references', () => {
    const node = createDraftNode('custom-id', 'Order', '订单');

    const keys = toNodeReferenceKeys(node);

    expect(keys).toContain('custom-id');
    expect(keys).toContain('Order');
    expect(keys).toContain('订单');
    expect(keys).not.toContain('node-1');
    expect(keys).not.toContain('1');
  });
});
