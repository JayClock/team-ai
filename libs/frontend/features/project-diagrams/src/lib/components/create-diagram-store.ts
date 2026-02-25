import { Collection, State } from '@hateoas-ts/resource';
import { batch, type ReadonlySignal, signal } from '@preact/signals-react';
import {
  Diagram,
  DiagramEdge,
  DiagramNode,
  LogicalEntity,
} from '@shared/schema';
import { Edge, Node } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';

const elk = new ELK();
const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 80;
const GENERATED_NODE_TYPE = 'sticky-note';
const ELK_LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.spacing.nodeNode': '80',
} as const;

export type DraftDiagramNodeInput = Pick<DiagramNode['data'], 'id'> & {
  localData: Pick<LogicalEntity['data'], 'name' | 'label' | 'type'>;
};
export type DraftDiagramEdgeInput = Pick<
  DiagramEdge['data'],
  'sourceNode' | 'targetNode'
>;

export type DraftDiagramInput = {
  nodes: DraftDiagramNodeInput[];
  edges: DraftDiagramEdgeInput[];
};

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

  async addGeneratedNodesAndEdges(params: DraftDiagramInput): Promise<void> {
    const { nodes, edges } = params;
    if (nodes.length === 0 && edges.length === 0) {
      return;
    }

    const existingNodeIds = new Set(
      this._diagramNodes.value.map((node) => node.id),
    );
    const existingEdgeIds = new Set(this._diagramEdges.value.map((edge) => edge.id));
    const existingEdgeKeys = new Set(
      this._diagramEdges.value.map((edge) => this.toEdgeKey(edge.source, edge.target)),
    );

    const generatedNodes: Node<DiagramNode['data']>[] = [];
    for (const node of nodes) {
      if (existingNodeIds.has(node.id)) {
        continue;
      }

      existingNodeIds.add(node.id);
      const logicalEntityData = this.toGeneratedLogicalEntityData(node);

      generatedNodes.push({
        id: node.id,
        type: GENERATED_NODE_TYPE,
        position: {
          x: 0,
          y: 0,
        },
        data: {
          id: node.id,
          type: GENERATED_NODE_TYPE,
          logicalEntity: null,
          parent: null,
          positionX: 0,
          positionY: 0,
          width: DEFAULT_NODE_WIDTH,
          height: DEFAULT_NODE_HEIGHT,
          localData: logicalEntityData,
        },
      });
    }

    const generatedEdges: Edge[] = [];
    for (const edge of edges) {
      const sourceId = edge.sourceNode.id;
      const targetId = edge.targetNode.id;
      const edgeKey = this.toEdgeKey(sourceId, targetId);
      if (existingEdgeKeys.has(edgeKey)) {
        continue;
      }

      existingEdgeKeys.add(edgeKey);
      const edgeId = this.toGeneratedEdgeId(sourceId, targetId, existingEdgeIds);
      generatedEdges.push({
        id: edgeId,
        source: sourceId,
        target: targetId,
      });
    }

    if (generatedNodes.length === 0 && generatedEdges.length === 0) {
      return;
    }

    const nextNodes = [
      ...this._diagramNodes.value,
      ...generatedNodes,
    ];
    const nextEdges = [
      ...this._diagramEdges.value,
      ...generatedEdges,
    ];

    const layoutedNodes = await this.layoutNodesWithElk(nextNodes, nextEdges);

    batch(() => {
      this._diagramNodes.value = [
        ...layoutedNodes,
      ];
      this._diagramEdges.value = [
        ...nextEdges,
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

  private toEdgeKey(source: string, target: string): string {
    return `${source}::${target}`;
  }

  private toGeneratedEdgeId(
    source: string,
    target: string,
    existingEdgeIds: Set<string>,
  ): string {
    const baseId = `generated:${source}::${target}`;
    let id = baseId;
    let suffix = 1;
    while (existingEdgeIds.has(id)) {
      id = `${baseId}:${suffix}`;
      suffix += 1;
    }
    existingEdgeIds.add(id);
    return id;
  }

  private toGeneratedLogicalEntityData(
    node: DraftDiagramNodeInput,
  ): LogicalEntity['data'] {
    const label = node.localData.label.trim() || node.localData.name;
    return {
      id: node.id,
      type: node.localData.type,
      subType: this.toDefaultSubType(node.localData.type),
      name: node.localData.name,
      label,
      definition: {},
    };
  }

  private toDefaultSubType(type: LogicalEntity['data']['type']): LogicalEntity['data']['subType'] {
    switch (type) {
      case 'CONTEXT':
        return 'bounded_context';
      case 'PARTICIPANT':
        return 'party';
      case 'ROLE':
        return 'party_role';
      case 'EVIDENCE':
      default:
        return 'rfp';
    }
  }

  private async layoutNodesWithElk(
    nodes: Node<DiagramNode['data']>[],
    edges: Edge[],
  ): Promise<Node<DiagramNode['data']>[]> {
    if (nodes.length === 0) {
      return nodes;
    }

    const elkGraph: ElkNode = {
      id: 'diagram',
      layoutOptions: ELK_LAYOUT_OPTIONS,
      children: nodes.map((node) => ({
        id: node.id,
        width:
          typeof node.data.width === 'number' && node.data.width > 0
            ? node.data.width
            : DEFAULT_NODE_WIDTH,
        height:
          typeof node.data.height === 'number' && node.data.height > 0
            ? node.data.height
            : DEFAULT_NODE_HEIGHT,
      })),
      edges: edges.map(
        (edge): ElkExtendedEdge => ({
          id: edge.id,
          sources: [edge.source],
          targets: [edge.target],
        }),
      ),
    };

    try {
      const layoutedGraph = await elk.layout(elkGraph);
      const positionsById = new Map<string, { x: number; y: number }>();
      for (const node of layoutedGraph.children ?? []) {
        positionsById.set(node.id, {
          x: typeof node.x === 'number' ? node.x : 0,
          y: typeof node.y === 'number' ? node.y : 0,
        });
      }

      return nodes.map((node) => {
        const position = positionsById.get(node.id);
        if (!position) {
          return node;
        }

        return {
          ...node,
          position,
          data: {
            ...node.data,
            positionX: position.x,
            positionY: position.y,
          },
        };
      });
    } catch {
      return nodes;
    }
  }
}

export function createDiagramStore(diagramState: State<Diagram>): DiagramStore {
  return new DiagramStore(diagramState);
}
