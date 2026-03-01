import { State } from '@hateoas-ts/resource';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import { type Signal } from '@preact/signals-react';
import {
  Project,
  KnowledgeGraph,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from '@shared/schema';
import { useEffect, useMemo, useRef } from 'react';

const GRAPH_HEIGHT = 560;

interface G6GraphInstance {
  render: () => void | Promise<void>;
  destroy: () => void;
  setSize?: (width: number, height: number) => void;
}

interface Props {
  state?: Signal<State<Project>>;
}

export function FeaturesProjects(props: Props) {
  const { state } = props;
  if (!state?.value) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        No project selected.
      </div>
    );
  }
  if (!state.value.hasLink('knowledge-graph')) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Current project does not expose a knowledge graph link.
      </div>
    );
  }
  return <ProjectsKnowledgeGraphContent projectState={state.value} />;
}

function ProjectsKnowledgeGraphContent(props: { projectState: State<Project> }) {
  const { projectState } = props;
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const graphResource = useMemo(
    () => projectState.follow('knowledge-graph'),
    [projectState],
  );
  const { data } = useSuspenseResource<KnowledgeGraph>(graphResource);
  const nodes = useMemo(() => data.nodes ?? [], [data.nodes]);
  const edges = useMemo(() => data.edges ?? [], [data.edges]);
  const nodeLabelById = useMemo(() => toNodeLabelById(nodes), [nodes]);
  const graphData = useMemo(
    () => toG6GraphData(nodes, edges, nodeLabelById),
    [nodes, edges, nodeLabelById],
  );

  useEffect(() => {
    const container = graphContainerRef.current;
    if (!container || graphData.nodes.length === 0) {
      return;
    }

    let cancelled = false;
    let graph: G6GraphInstance | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const initialize = async () => {
      const g6 = await import('@antv/g6');
      if (cancelled || !container) {
        return;
      }

      const GraphConstructor = g6.Graph as unknown as new (options: object) => G6GraphInstance;
      graph = new GraphConstructor({
        container,
        width: Math.max(container.clientWidth, 320),
        height: GRAPH_HEIGHT,
        autoFit: 'view',
        data: graphData,
        layout: {
          type: 'force',
          preventOverlap: true,
          linkDistance: 180,
          nodeStrength: -60,
          edgeStrength: 0.2,
        },
        node: {
          type: 'rect',
          style: {
            size: [190, 56],
            radius: 10,
            fill: '#f8fafc',
            stroke: '#94a3b8',
            lineWidth: 1,
            labelPlacement: 'center',
            labelFill: '#111827',
            labelFontSize: 12,
          },
        },
        edge: {
          type: 'line',
          style: {
            stroke: '#94a3b8',
            lineWidth: 1.2,
            endArrow: true,
            labelBackground: true,
            labelBackgroundFill: '#ffffff',
            labelBackgroundRadius: 4,
            labelPadding: [2, 4],
          },
        },
        behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
      });
      await Promise.resolve(graph.render());

      resizeObserver = new ResizeObserver(() => {
        if (!graph || !graph.setSize) {
          return;
        }
        graph.setSize(Math.max(container.clientWidth, 320), GRAPH_HEIGHT);
      });
      resizeObserver.observe(container);
    };

    void initialize();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      graph?.destroy();
    };
  }, [graphData]);

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Knowledge Graph</h2>
        <p className="text-sm text-muted-foreground">
          {nodes.length} node{nodes.length === 1 ? '' : 's'} · {edges.length} edge
          {edges.length === 1 ? '' : 's'}
        </p>
      </div>
      {nodes.length === 0 ? (
        <div className="flex h-[560px] items-center justify-center rounded-md border text-sm text-muted-foreground">
          No knowledge graph data yet.
        </div>
      ) : (
        <div
          ref={graphContainerRef}
          className="h-[560px] w-full rounded-md border bg-gradient-to-br from-slate-50 to-slate-100"
        />
      )}

      <div className="mt-4 rounded-md border p-3">
        <h3 className="text-sm font-semibold">Relations</h3>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {edges.length === 0 ? (
            <li>No relations found.</li>
          ) : (
            edges.slice(0, 12).map((edge, index) => (
              <li
                key={`${edge.diagramId}-${edge.sourceLogicalEntityId}-${edge.targetLogicalEntityId}-${edge.relationType}-${index}`}
              >
                {nodeLabelById.get(edge.sourceLogicalEntityId) ||
                  edge.sourceLogicalEntityId}{' '}
                <span className="font-medium text-foreground">[{edge.relationType}]</span>{' '}
                {nodeLabelById.get(edge.targetLogicalEntityId) ||
                  edge.targetLogicalEntityId}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function toNodeLabelById(nodes: KnowledgeGraphNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of nodes) {
    map.set(node.logicalEntityId, node.label || node.name);
  }
  return map;
}

function toG6GraphData(
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
  nodeLabelById: Map<string, string>,
) {
  return {
    nodes: nodes.map((node) => ({
      id: node.logicalEntityId,
      style: {
        labelText: node.label || node.name,
      },
      data: {
        type: node.type,
        subType: node.subType,
      },
    })),
    edges: edges.map((edge, index) => ({
      id: `${edge.diagramId}-${edge.sourceLogicalEntityId}-${edge.targetLogicalEntityId}-${edge.relationType}-${index}`,
      source: edge.sourceLogicalEntityId,
      target: edge.targetLogicalEntityId,
      style: {
        labelText: edge.relationType,
      },
      data: {
        sourceLabel:
          nodeLabelById.get(edge.sourceLogicalEntityId) ||
          edge.sourceLogicalEntityId,
        targetLabel:
          nodeLabelById.get(edge.targetLogicalEntityId) ||
          edge.targetLogicalEntityId,
      },
    })),
  };
}

export default FeaturesProjects;
