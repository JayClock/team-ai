import { State } from '@hateoas-ts/resource';
import { Diagram, DiagramEdge, DiagramNode, LogicalEntity } from '@shared/schema';
import { describe, expect, it, vi } from 'vitest';
import {
  createDiagramStore,
  type DraftDiagramEdgeInput,
  type DraftDiagramNodeInput,
  type DiagramStoreState,
  DiagramStore,
} from '../../lib/components/create-diagram-store';

function createLogicalEntityData(
  id: string,
  name: string,
): LogicalEntity['data'] {
  return {
    id,
    type: 'EVIDENCE',
    subType: 'rfp',
    name,
    label: name,
    definition: {},
  };
}

function createNodeState(id: string): State<DiagramNode> {
  const logicalEntityData = createLogicalEntityData(id, `Entity ${id}`);

  return {
    data: {
      id,
      type: 'fulfillment-node',
      logicalEntity: { id },
      parent: null,
      positionX: 10,
      positionY: 20,
      width: 100,
      height: 80,
      localData: logicalEntityData,
    },
    hasLink: () => true,
    follow: () => ({
      get: async () => ({ data: logicalEntityData }),
    }) as never,
  } as unknown as State<DiagramNode>;
}

function createEdgeState(): State<DiagramEdge> {
  return {
    data: {
      id: 'edge-1',
      sourceNode: { id: 'node-1' },
      targetNode: { id: 'node-2' },
      sourceHandle: null,
      targetHandle: null,
      relationType: 'FLOW',
      label: null,
      styleProps: null,
    },
  } as State<DiagramEdge>;
}

function createGeneratedNodeData(id: string): DraftDiagramNodeInput {
  return {
    id,
    localData: {
      name: `Entity ${id}`,
      label: `Entity ${id}`,
      type: 'EVIDENCE',
      subType: 'rfp',
    },
  };
}

function createGeneratedContextNodeData(id: string): DraftDiagramNodeInput {
  return {
    id,
    localData: {
      name: `Context ${id}`,
      label: `Context ${id}`,
      type: 'CONTEXT',
      subType: 'bounded_context',
    },
  };
}

function createGeneratedEdgeData(
  sourceNodeId: string,
  targetNodeId: string,
): DraftDiagramEdgeInput {
  return {
    sourceNode: { id: sourceNodeId },
    targetNode: { id: targetNodeId },
  };
}

function createDiagramState(title: string): State<Diagram> {
  return {
    data: {
      id: 'diagram-1',
      title,
      type: 'fulfillment',
      status: 'draft',
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    follow: (rel: string) => {
      if (rel === 'nodes') {
        return {
          get: async () => ({
            collection: [createNodeState('node-1'), createNodeState('node-2')],
          }),
        } as never;
      }

      return {
        get: async () => ({
          collection: [createEdgeState()],
        }),
      } as never;
    },
    hasLink: (rel: string) => rel === 'commit-draft',
    action: () => ({
      submit: async () => ({}) as never,
    }),
  } as unknown as State<Diagram>;
}

function createDiagramStateWithCommitDraft(
  title: string,
  submit: (payload: unknown) => Promise<unknown>,
): State<Diagram> {
  return {
    ...createDiagramState(title),
    hasLink: (rel: string) => rel === 'commit-draft',
    action: () => ({
      submit,
    }),
  } as unknown as State<Diagram>;
}

function createDiagramStateWithoutCommitDraftLink(title: string): State<Diagram> {
  return {
    ...createDiagramState(title),
    hasLink: () => false,
  } as unknown as State<Diagram>;
}

function createDiagramStateWithPublishDiagram(
  title: string,
  submit: (payload: unknown) => Promise<unknown>,
): State<Diagram> {
  const baseState = createDiagramState(title);

  const publishedState = {
    ...baseState,
    data: {
      ...baseState.data,
      status: 'published' as const,
    },
    hasLink: (rel: string) => rel === 'commit-draft',
  } as unknown as State<Diagram>;

  return {
    ...baseState,
    hasLink: (rel: string) =>
      rel === 'commit-draft' || rel === 'publish-diagram',
    action: (rel: string) => {
      if (rel === 'publish-diagram') {
        return {
          submit,
        };
      }
      return {
        submit: async () => ({}),
      };
    },
    follow: (rel: string) => {
      if (rel === 'self') {
        return {
          get: async () => publishedState,
        } as never;
      }

      return baseState.follow(rel as never);
    },
  } as unknown as State<Diagram>;
}

function createDiagramStateWithoutPublishDiagramLink(
  title: string,
): State<Diagram> {
  return {
    ...createDiagramState(title),
    hasLink: (rel: string) => rel === 'commit-draft',
  } as unknown as State<Diagram>;
}

async function waitForStoreLoad(store: DiagramStore) {
  for (let i = 0; i < 20 && store.state.value.status === 'loading'; i += 1) {
    await Promise.resolve();
  }
}

function expectStateError(
  state: DiagramStoreState,
  status: 'load-error' | 'save-error' | 'publish-error',
  message: string,
) {
  expect(state.status).toBe(status);
  if (state.status === status) {
    expect(state.error.message).toBe(message);
  }
}

describe('createDiagramStore', () => {
  it('returns class instance', () => {
    const store = createDiagramStore(createDiagramState('Diagram A'));

    expect(store).toBeInstanceOf(DiagramStore);
  });

  it('loads diagram state during construction', async () => {
    const store = createDiagramStore(createDiagramState('Diagram A'));

    await waitForStoreLoad(store);

    expect(store.state.value).toEqual({ status: 'ready' });
    expect(store.diagramTitle.value).toBe('Diagram A');
    expect(store.diagramNodes.value).toHaveLength(2);
    expect(store.diagramEdges.value).toHaveLength(1);
  });

  it('keeps store instances isolated', () => {
    const storeA = createDiagramStore(createDiagramState('A'));
    const storeB = createDiagramStore(createDiagramState('B'));

    expect(storeA).not.toBe(storeB);
    expect(storeA.diagramTitle).not.toBe(storeB.diagramTitle);
  });

  it('appends generated nodes and edges into diagram state', async () => {
    const store = createDiagramStore(createDiagramState('Diagram A'));
    await waitForStoreLoad(store);

    store.addGeneratedNodesAndEdges({
      nodes: [createGeneratedNodeData('node-3')],
      edges: [createGeneratedEdgeData('node-2', 'node-3')],
    });

    expect(store.diagramNodes.value).toHaveLength(3);
    expect(store.diagramEdges.value).toHaveLength(2);
    const generatedNode = store.diagramNodes.value.find(
      (node) => node.id === 'node-3',
    );
    expect(generatedNode).toBeDefined();
    expect(generatedNode).toMatchObject({
      id: 'node-3',
      type: 'fulfillment-node',
      data: {
        id: 'node-3',
        type: 'EVIDENCE',
        subType: 'rfp',
        name: 'Entity node-3',
        label: 'Entity node-3',
        definition: {},
      },
    });
    expect(generatedNode?.position.x).toEqual(expect.any(Number));
    expect(generatedNode?.position.y).toEqual(expect.any(Number));
    const generatedEdge = store.diagramEdges.value.find((edge) => (
      edge.source === 'node-2' && edge.target === 'node-3'
    ));
    expect(generatedEdge).toMatchObject({
      source: 'node-2',
      target: 'node-3',
    });
  });

  it('deduplicates generated nodes and edges by id', async () => {
    const store = createDiagramStore(createDiagramState('Diagram A'));
    await waitForStoreLoad(store);

    store.addGeneratedNodesAndEdges({
      nodes: [createGeneratedNodeData('node-3'), createGeneratedNodeData('node-3')],
      edges: [
        createGeneratedEdgeData('node-2', 'node-3'),
        createGeneratedEdgeData('node-2', 'node-3'),
      ],
    });

    expect(store.diagramNodes.value.filter((node) => node.id === 'node-3'))
      .toHaveLength(1);
    expect(
      store.diagramEdges.value.filter(
        (edge) => edge.source === 'node-2' && edge.target === 'node-3',
      ),
    ).toHaveLength(1);
  });

  it('accepts generated nodes without incoming positions and uses elk layout', async () => {
    const store = createDiagramStore(createDiagramState('Diagram A'));
    await waitForStoreLoad(store);

    const result = store.addGeneratedNodesAndEdges({
      nodes: [
        {
          id: 'node-4',
          localData: {
            name: 'Entity node-4',
            label: 'Entity node-4',
            type: 'EVIDENCE',
            subType: 'rfp',
          },
        },
      ],
      edges: [createGeneratedEdgeData('node-2', 'node-4')],
    });
    expect(result).toBeUndefined();

    const generatedNode = store.diagramNodes.value.find(
      (node) => node.id === 'node-4',
    );
    expect(generatedNode).toBeDefined();
    expect(generatedNode?.position.x).toEqual(expect.any(Number));
    expect(generatedNode?.position.y).toEqual(expect.any(Number));
    expect(generatedNode?.data).toMatchObject({
      id: 'node-4',
      type: 'EVIDENCE',
      subType: 'rfp',
      name: 'Entity node-4',
      label: 'Entity node-4',
      definition: {},
    });
  });

  it('supports generated parent relationship for context container', async () => {
    const store = createDiagramStore(createDiagramState('Diagram A'));
    await waitForStoreLoad(store);

    store.addGeneratedNodesAndEdges({
      nodes: [
        createGeneratedContextNodeData('context-1'),
        {
          id: 'node-3',
          parent: { id: 'context-1' },
          localData: {
            name: 'Payment Request',
            label: '支付申请',
            type: 'EVIDENCE',
            subType: 'fulfillment_request',
          },
        },
      ],
      edges: [createGeneratedEdgeData('context-1', 'node-3')],
    });

    const contextNode = store.diagramNodes.value.find((node) => node.id === 'context-1');
    const childNode = store.diagramNodes.value.find((node) => node.id === 'node-3');
    expect(contextNode).toBeDefined();
    expect(childNode).toBeDefined();
    expect(contextNode?.type).toBe('group-container');
    expect(contextNode?.data).toMatchObject({
      type: 'CONTEXT',
      subType: 'bounded_context',
    });
    expect(childNode?.parentId).toBe('context-1');
  });

  it('includes parent.id in commit-draft payload for nested nodes', async () => {
    const submit = vi.fn(async (_payload: unknown) => ({}));
    const store = createDiagramStore(
      createDiagramStateWithCommitDraft('Diagram A', submit),
    );
    await waitForStoreLoad(store);

    store.addGeneratedNodesAndEdges({
      nodes: [
        createGeneratedContextNodeData('context-1'),
        {
          id: 'node-3',
          parent: { id: 'context-1' },
          localData: {
            name: 'Invoice Confirmation',
            label: '发票确认',
            type: 'EVIDENCE',
            subType: 'fulfillment_confirmation',
          },
        },
      ],
      edges: [],
    });
    await store.saveDiagram();

    const payload = submit.mock.calls[0][0] as {
      nodes: Array<{ id: string; parent?: { id: string } }>;
    };
    const nestedNode = payload.nodes.find((node) => node.id === 'node-3');
    expect(nestedNode).toBeDefined();
    expect(nestedNode?.parent).toEqual({ id: 'context-1' });
  });

  it('converts diagram nodes and edges to commit-draft payload and submits', async () => {
    const submit = vi.fn(async () => ({}));
    const store = createDiagramStore(
      createDiagramStateWithCommitDraft('Diagram A', submit),
    );
    await waitForStoreLoad(store);

    await store.saveDiagram();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({
      nodes: [
        {
          id: 'node-1',
          type: 'fulfillment-node',
          positionX: 10,
          positionY: 20,
          localData: createLogicalEntityData('node-1', 'Entity node-1'),
          width: 100,
          height: 80,
        },
        {
          id: 'node-2',
          type: 'fulfillment-node',
          positionX: 10,
          positionY: 20,
          localData: createLogicalEntityData('node-2', 'Entity node-2'),
          width: 100,
          height: 80,
        },
      ],
      edges: [
        {
          id: 'edge-1',
          sourceNode: { id: 'node-1' },
          targetNode: { id: 'node-2' },
        },
      ],
    });
    expect(store.state.value).toEqual({ status: 'ready' });
  });

  it('throws when commit-draft link is missing', async () => {
    const store = createDiagramStore(
      createDiagramStateWithoutCommitDraftLink('Diagram A'),
    );
    await waitForStoreLoad(store);

    await expect(store.saveDiagram()).rejects.toThrow(
      '当前图表缺少保存草稿所需的链接。',
    );
    expectStateError(
      store.state.value,
      'save-error',
      '当前图表缺少保存草稿所需的链接。',
    );
  });

  it('updates save loading and error state when save fails', async () => {
    const submit = vi.fn(async () => {
      throw new Error('保存失败');
    });
    const store = createDiagramStore(
      createDiagramStateWithCommitDraft('Diagram A', submit),
    );
    await waitForStoreLoad(store);

    await expect(store.saveDiagram()).rejects.toThrow('保存失败');
    expectStateError(store.state.value, 'save-error', '保存失败');
  });

  it('publishes diagram and refreshes publish status from self link', async () => {
    const submit = vi.fn(async () => ({}));
    const store = createDiagramStore(
      createDiagramStateWithPublishDiagram('Diagram A', submit),
    );
    await waitForStoreLoad(store);

    expect(store.canPublishDiagram()).toBe(true);
    await store.publishDiagram();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({});
    expect(store.state.value).toEqual({ status: 'ready' });
    expect(store.canPublishDiagram()).toBe(false);
  });

  it('throws when publish-diagram link is missing', async () => {
    const store = createDiagramStore(
      createDiagramStateWithoutPublishDiagramLink('Diagram A'),
    );
    await waitForStoreLoad(store);

    await expect(store.publishDiagram()).rejects.toThrow(
      '当前图表缺少发布所需的链接。',
    );
    expectStateError(
      store.state.value,
      'publish-error',
      '当前图表缺少发布所需的链接。',
    );
  });

  it('updates publish loading and error state when publish fails', async () => {
    const submit = vi.fn(async () => {
      throw new Error('发布失败');
    });
    const store = createDiagramStore(
      createDiagramStateWithPublishDiagram('Diagram A', submit),
    );
    await waitForStoreLoad(store);

    await expect(store.publishDiagram()).rejects.toThrow('发布失败');
    expectStateError(store.state.value, 'publish-error', '发布失败');
  });
});
