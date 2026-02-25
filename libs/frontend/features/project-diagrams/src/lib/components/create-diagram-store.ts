import { Collection, State } from '@hateoas-ts/resource';
import { batch, type ReadonlySignal, signal } from '@preact/signals-react';
import {
  Diagram,
  DiagramEdge,
  DiagramNode,
  LogicalEntity,
} from '@shared/schema';
import { Edge, Node } from '@xyflow/react';

export class DiagramStore {
  private readonly _diagramTitle = signal<string>('');
  private readonly _diagramNodes = signal<Node<DiagramNode['data']>[]>([]);
  private readonly _diagramEdges = signal<Edge[]>([]);
  private readonly _isDiagramLoading = signal<boolean>(true);
  private readonly _diagramError = signal<Error | null>(null);

  public readonly diagramTitle: ReadonlySignal<string> =
    this._diagramTitle;
  public readonly diagramNodes: ReadonlySignal<Node<DiagramNode['data']>[]> =
    this._diagramNodes;
  public readonly diagramEdges: ReadonlySignal<Edge[]> =
    this._diagramEdges;
  public readonly isDiagramLoading: ReadonlySignal<boolean> =
    this._isDiagramLoading;
  public readonly diagramError: ReadonlySignal<Error | null> =
    this._diagramError;

  constructor(private readonly diagramState: State<Diagram>) {
    void this.load();
  }

  addGeneratedNodesAndEdges(params: {
    nodes: DiagramNode['data'][];
    edges: DiagramEdge['data'][];
  }) {
    const { nodes, edges } = params;
    if (nodes.length === 0 && edges.length === 0) {
      return;
    }

    const existingNodeIds = new Set(
      this._diagramNodes.value.map((node) => node.id),
    );
    const existingEdgeIds = new Set(
      this._diagramEdges.value.map((edge) => edge.id),
    );

    const generatedNodes: Node<DiagramNode['data']>[] = [];
    for (const node of nodes) {
      if (existingNodeIds.has(node.id)) {
        continue;
      }

      existingNodeIds.add(node.id);
      generatedNodes.push({
        id: node.id,
        type: node.type,
        position: {
          x: node.positionX,
          y: node.positionY,
        },
        data: node,
      });
    }

    const generatedEdges: Edge[] = [];
    for (const edge of edges) {
      if (existingEdgeIds.has(edge.id)) {
        continue;
      }

      existingEdgeIds.add(edge.id);
      generatedEdges.push({
        id: edge.id,
        source: edge.sourceNode.id,
        target: edge.targetNode.id,
      });
    }

    if (generatedNodes.length === 0 && generatedEdges.length === 0) {
      return;
    }

    batch(() => {
      this._diagramNodes.value = [
        ...this._diagramNodes.value,
        ...generatedNodes,
      ];
      this._diagramEdges.value = [
        ...this._diagramEdges.value,
        ...generatedEdges,
      ];
    });
  }

  private async load() {
    try {
      const [nodesState, edgesState]: [
        State<Collection<DiagramNode>>,
        State<Collection<DiagramEdge>>,
      ] = await Promise.all([
        this.diagramState.follow('nodes').get(),
        this.diagramState.follow('edges').get(),
      ]);

      const logicalEntities = await Promise.all(
        nodesState.collection.map(
          async (nodeState): Promise<LogicalEntity['data'] | null> => {
            if (
              nodeState.data.logicalEntity === null ||
              !nodeState.hasLink('logical-entity')
            ) {
              return null;
            }

            const logicalEntityState = await nodeState
              .follow('logical-entity')
              .get();

            return logicalEntityState.data;
          },
        ),
      );

      const logicalEntityDataByNodeId = this.toLogicalEntityDataByNodeId(
        logicalEntities.filter(
          (item): item is LogicalEntity['data'] => item !== null,
        ),
      );

      const finalNodes = this.toDiagramNodes(
        nodesState.collection,
        logicalEntityDataByNodeId,
      );
      const finalEdges = this.toDiagramEdges(edgesState.collection);

      batch(() => {
        this._diagramTitle.value = this.diagramState.data.title;
        this._diagramNodes.value = finalNodes;
        this._diagramEdges.value = finalEdges;
        this._isDiagramLoading.value = false;
      });
    } catch (error) {
      batch(() => {
        this._diagramError.value =
          error instanceof Error ? error : new Error(String(error));
        this._isDiagramLoading.value = false;
      });
    }
  }

  private toLogicalEntityDataByNodeId(
    logicalEntities: LogicalEntity['data'][],
  ): Map<string, LogicalEntity['data'] | null> {
    const map = new Map<string, LogicalEntity['data'] | null>();
    logicalEntities.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }

  private toDiagramNodes(
    nodesStateCollection: State<DiagramNode>[],
    logicalEntityDataByNodeId: Map<string, LogicalEntity['data'] | null>,
  ): Node<DiagramNode['data']>[] {
    return nodesStateCollection.map((nodeState) => {
      const localData =
        logicalEntityDataByNodeId.get(nodeState.data.id) ??
        nodeState.data.localData ??
        null;

      return {
        id: nodeState.data.id,
        type: nodeState.data.type,
        position: {
          x: nodeState.data.positionX,
          y: nodeState.data.positionY,
        },
        data: {
          ...nodeState.data,
          localData,
        },
      };
    });
  }

  private toDiagramEdges(
    edgesStateCollection: State<DiagramEdge>[],
  ): Edge[] {
    return edgesStateCollection.map((edgeState) => ({
      id: edgeState.data.id,
      source: edgeState.data.sourceNode.id,
      target: edgeState.data.targetNode.id,
    }));
  }
}

export function createDiagramStore(diagramState: State<Diagram>): DiagramStore {
  return new DiagramStore(diagramState);
}
