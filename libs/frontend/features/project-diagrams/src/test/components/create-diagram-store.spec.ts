import { State } from '@hateoas-ts/resource';
import { Diagram, DiagramEdge, DiagramNode, LogicalEntity } from '@shared/schema';
import { describe, expect, it } from 'vitest';
import {
  createDiagramStore,
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

function createGeneratedNodeData(id: string): DiagramNode['data'] {
  return {
    id,
    type: 'sticky-note',
    logicalEntity: null,
    parent: null,
    positionX: 200,
    positionY: 300,
    width: 160,
    height: 80,
    localData: createLogicalEntityData(id, `Entity ${id}`),
  };
}

function createGeneratedEdgeData(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
): DiagramEdge['data'] {
  return {
    id,
    sourceNode: { id: sourceNodeId },
    targetNode: { id: targetNodeId },
    sourceHandle: null,
    targetHandle: null,
    relationType: 'FLOW',
    label: null,
    styleProps: null,
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
  } as unknown as State<Diagram>;
}

async function waitForStoreLoad(store: DiagramStore) {
  for (let i = 0; i < 20 && store.isDiagramLoading.value; i += 1) {
    await Promise.resolve();
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

    expect(store.isDiagramLoading.value).toBe(false);
    expect(store.diagramError.value).toBeNull();
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
      edges: [createGeneratedEdgeData('edge-2', 'node-2', 'node-3')],
    });

    expect(store.diagramNodes.value).toHaveLength(3);
    expect(store.diagramEdges.value).toHaveLength(2);
    expect(store.diagramNodes.value.at(-1)).toMatchObject({
      id: 'node-3',
      type: 'sticky-note',
      position: {
        x: 200,
        y: 300,
      },
      data: {
        id: 'node-3',
      },
    });
    expect(store.diagramEdges.value.at(-1)).toMatchObject({
      id: 'edge-2',
      source: 'node-2',
      target: 'node-3',
    });
  });
});
