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
import { calculateLayout } from './calculate-layout';

const elk = new ELK();
const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 80;
const CONTEXT_NODE_WIDTH = 420;
const CONTEXT_NODE_HEIGHT = 280;
const GENERATED_NODE_TYPE = 'fulfillment-node';
const GENERATED_GROUP_NODE_TYPE = 'group-container';
const ELK_LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.spacing.nodeNode': '80',
} as const;

export type DraftDiagramNodeInput = Pick<DiagramNode['data'], 'id'> & {
  parent?: Pick<NonNullable<DiagramNode['data']['parent']>, 'id'> | null;
  localData: Pick<LogicalEntity['data'], 'name' | 'label' | 'type'> &
  Partial<Pick<LogicalEntity['data'], 'subType'>>;
};
export type DraftDiagramEdgeInput = Pick<
  DiagramEdge['data'],
  'sourceNode' | 'targetNode'
>;

export type DraftDiagramInput = {
  nodes: DraftDiagramNodeInput[];
  edges: DraftDiagramEdgeInput[];
};

export type DiagramStoreState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'saving' }
  | { status: 'publishing' }
  | { status: 'load-error'; error: Error }
  | { status: 'save-error'; error: Error }
  | { status: 'publish-error'; error: Error };

export class DiagramStore {
  private readonly _diagramTitle = signal<string>('');
  private readonly _diagramNodes = signal<Node<LogicalEntity['data']>[]>([]);
  private readonly _diagramEdges = signal<Edge[]>([]);
  private readonly _state = signal<DiagramStoreState>({ status: 'loading' });

  public readonly diagramTitle: ReadonlySignal<string> =
    this._diagramTitle;
  public readonly diagramNodes: ReadonlySignal<Node<LogicalEntity['data']>[]> =
    this._diagramNodes;
  public readonly diagramEdges: ReadonlySignal<Edge[]> =
    this._diagramEdges;
  public readonly state: ReadonlySignal<DiagramStoreState> =
    this._state;

  constructor(private diagramState: State<Diagram>) {
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

    const generatedNodes: Node<LogicalEntity['data']>[] = [];
    for (const node of nodes) {
      if (existingNodeIds.has(node.id)) {
        continue;
      }

      existingNodeIds.add(node.id);
      const logicalEntityData = this.toGeneratedLogicalEntityData(node);
      const generatedNodeType = this.toGeneratedNodeType(node.localData.type);
      const generatedNodeSize = this.toGeneratedNodeSize(node.localData.type);
      const parentId = node.parent?.id;

      generatedNodes.push({
        id: node.id,
        type: generatedNodeType,
        parentId,
        position: {
          x: 0,
          y: 0,
        },
        width: generatedNodeSize.width,
        height: generatedNodeSize.height,
        data: logicalEntityData,
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

    const hasNestedNodes = nextNodes.some((node) => typeof node.parentId === 'string');
    const layoutedNodes = hasNestedNodes
      ? this.layoutNodesWithParentHierarchy(nextNodes, nextEdges)
      : await this.layoutNodesWithElk(nextNodes, nextEdges);

    batch(() => {
      this._diagramNodes.value = [
        ...layoutedNodes,
      ];
      this._diagramEdges.value = [
        ...nextEdges,
      ];
    });
  }

  async saveDiagram(): Promise<void> {
    if (!this.diagramState.hasLink('commit-draft')) {
      const error = new Error('当前图表缺少保存草稿所需的链接。');
      this._state.value = { status: 'save-error', error };
      throw error;
    }

    const payload = {
      nodes: this._diagramNodes.value.map((node) => ({
        id: node.id,
        type: node.type,
        ...(node.parentId ? { parent: { id: node.parentId } } : {}),
        positionX: node.position.x,
        positionY: node.position.y,
        localData: node.data ?? null,
        width: node.width,
        height: node.height,
      })),
      edges: this._diagramEdges.value.map((edge) => ({
        id: edge.id,
        sourceNode: { id: edge.source },
        targetNode: { id: edge.target },
      })),
    };

    this._state.value = { status: 'saving' };

    try {
      await this.diagramState.action('commit-draft').submit(payload);
      this._state.value = { status: 'ready' };
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this._state.value = { status: 'save-error', error: normalizedError };
      throw normalizedError;
    }
  }

  canPublishDiagram(): boolean {
    if (
      this._state.value.status === 'loading' ||
      this._state.value.status === 'saving' ||
      this._state.value.status === 'publishing'
    ) {
      return false;
    }

    if (this.diagramState.data.status === 'published') {
      return false;
    }

    return this.diagramState.hasLink('publish-diagram');
  }

  async publishDiagram(): Promise<void> {
    if (!this.diagramState.hasLink('publish-diagram')) {
      const error = new Error('当前图表缺少发布所需的链接。');
      this._state.value = { status: 'publish-error', error };
      throw error;
    }

    if (
      this.diagramState.data.status === 'published' ||
      this._state.value.status === 'publishing'
    ) {
      return;
    }

    this._state.value = { status: 'publishing' };

    try {
      await this.diagramState.action('publish-diagram').submit({});
      this.diagramState = await this.diagramState.follow('self').get();

      batch(() => {
        this._diagramTitle.value = this.diagramState.data.title;
        this._state.value = { status: 'ready' };
      });
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this._state.value = { status: 'publish-error', error: normalizedError };
      throw normalizedError;
    }
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
        this._state.value = { status: 'ready' };
      });
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this._state.value = { status: 'load-error', error: normalizedError };
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
  ): Node<LogicalEntity['data']>[] {
    return nodesStateCollection.map((nodeState) => {
      const localData =
        logicalEntityDataByNodeId.get(nodeState.data.id) ??
        nodeState.data.localData ??
        null;

      return {
        id: nodeState.data.id,
        type: nodeState.data.type,
        parentId: nodeState.data.parent?.id ?? undefined,
        position: {
          x: nodeState.data.positionX,
          y: nodeState.data.positionY,
        },
        width: nodeState.data.width,
        height: nodeState.data.height,
        data: localData,
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
      subType: node.localData.subType ?? this.toDefaultSubType(node.localData.type),
      name: node.localData.name,
      label,
      definition: {},
    };
  }

  private toGeneratedNodeType(type: LogicalEntity['data']['type']): string {
    if (type === 'CONTEXT') {
      return GENERATED_GROUP_NODE_TYPE;
    }
    return GENERATED_NODE_TYPE;
  }

  private toGeneratedNodeSize(
    type: LogicalEntity['data']['type'],
  ): { width: number; height: number } {
    if (type === 'CONTEXT') {
      return { width: CONTEXT_NODE_WIDTH, height: CONTEXT_NODE_HEIGHT };
    }
    return { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT };
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
    nodes: Node<LogicalEntity['data']>[],
    edges: Edge[],
  ): Promise<Node<LogicalEntity['data']>[]> {
    if (nodes.length === 0) {
      return nodes;
    }

    const elkGraph: ElkNode = {
      id: 'diagram',
      layoutOptions: ELK_LAYOUT_OPTIONS,
      children: nodes.map((node) => ({
        id: node.id,
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
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
        };
      });
    } catch {
      return nodes;
    }
  }

  private layoutNodesWithParentHierarchy(
    nodes: Node<LogicalEntity['data']>[],
    edges: Edge[],
  ): Node<LogicalEntity['data']>[] {
    return calculateLayout(nodes, edges);
  }
}

export function createDiagramStore(diagramState: State<Diagram>): DiagramStore {
  return new DiagramStore(diagramState);
}
