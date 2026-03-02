import { State } from '@hateoas-ts/resource';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import { type Signal } from '@preact/signals-react';
import {
  AgentCollection,
  AgentEventCollection,
  KnowledgeGraph,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  Orchestration,
  Project,
  TaskCollection,
} from '@shared/schema';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

const GRAPH_HEIGHT = 560;

type ProjectTab = 'orchestration' | 'graph';

type OrchestrationRequestPayload = {
  goal: string;
  title?: string;
  scope?: string;
  acceptanceCriteria?: string[];
  verificationCommands?: string[];
};

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

  return <ProjectsWorkspaceContent projectState={state.value} />;
}

function ProjectsWorkspaceContent(props: { projectState: State<Project> }) {
  const { projectState } = props;
  const hasOrchestration =
    projectState.hasLink('orchestrations') &&
    projectState.hasLink('agents') &&
    projectState.hasLink('tasks') &&
    projectState.hasLink('events');
  const hasGraph = projectState.hasLink('knowledge-graph');

  const [activeTab, setActiveTab] = useState<ProjectTab>(
    hasOrchestration ? 'orchestration' : 'graph',
  );

  useEffect(() => {
    if (activeTab === 'orchestration' && !hasOrchestration && hasGraph) {
      setActiveTab('graph');
      return;
    }
    if (activeTab === 'graph' && !hasGraph && hasOrchestration) {
      setActiveTab('orchestration');
    }
  }, [activeTab, hasGraph, hasOrchestration]);

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Project Workspace</h2>
          <p className="text-sm text-muted-foreground">
            Orchestrate agents and inspect project knowledge.
          </p>
        </div>
        <div className="inline-flex rounded-lg border bg-background p-1">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              activeTab === 'orchestration'
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            disabled={!hasOrchestration}
            onClick={() => setActiveTab('orchestration')}
          >
            Orchestration
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              activeTab === 'graph'
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            disabled={!hasGraph}
            onClick={() => setActiveTab('graph')}
          >
            Knowledge Graph
          </button>
        </div>
      </header>

      {activeTab === 'orchestration' ? (
        hasOrchestration ? (
          <ProjectOrchestrationContent projectState={projectState} />
        ) : (
          <MissingPanelMessage message="Current project does not expose orchestration links." />
        )
      ) : hasGraph ? (
        <ProjectsKnowledgeGraphContent projectState={projectState} />
      ) : (
        <MissingPanelMessage message="Current project does not expose a knowledge graph link." />
      )}
    </div>
  );
}

function ProjectOrchestrationContent(props: { projectState: State<Project> }) {
  const { projectState } = props;

  const orchestrationApi = useMemo(
    () => projectState.follow('orchestrations'),
    [projectState],
  );
  const agentsResource = useMemo(() => projectState.follow('agents'), [projectState]);
  const tasksResource = useMemo(() => projectState.follow('tasks'), [projectState]);
  const eventsResource = useMemo(() => projectState.follow('events'), [projectState]);

  const { resourceState: agentsState, resource: agentsApi } =
    useSuspenseResource<AgentCollection>(agentsResource);
  const { resourceState: tasksState, resource: tasksApi } =
    useSuspenseResource<TaskCollection>(tasksResource);
  const { resourceState: eventsState, resource: eventsApi } =
    useSuspenseResource<AgentEventCollection>(eventsResource);

  const [goal, setGoal] = useState('');
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState('');
  const [acceptanceText, setAcceptanceText] = useState('');
  const [verificationText, setVerificationText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const events = useMemo(
    () =>
      [...eventsState.collection].sort(
        (left, right) =>
          Date.parse(right.data.occurredAt) - Date.parse(left.data.occurredAt),
      ),
    [eventsState.collection],
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedGoal = goal.trim();
    if (!normalizedGoal) {
      setErrorMessage('Goal is required.');
      return;
    }

    const payload: OrchestrationRequestPayload = {
      goal: normalizedGoal,
    };

    const normalizedTitle = normalizeOptionalText(title);
    const normalizedScope = normalizeOptionalText(scope);
    const acceptanceCriteria = toStringList(acceptanceText);
    const verificationCommands = toStringList(verificationText);

    if (normalizedTitle) {
      payload.title = normalizedTitle;
    }
    if (normalizedScope) {
      payload.scope = normalizedScope;
    }
    if (acceptanceCriteria.length > 0) {
      payload.acceptanceCriteria = acceptanceCriteria;
    }
    if (verificationCommands.length > 0) {
      payload.verificationCommands = verificationCommands;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setResultMessage(null);

    try {
      const orchestrationState = await orchestrationApi.post(
        { data: payload },
        { dedup: true },
      );
      const data = orchestrationState.data as Orchestration['data'];

      await Promise.all([
        agentsApi.refresh(),
        tasksApi.refresh(),
        eventsApi.refresh(),
      ]);

      setResultMessage(
        `Started task ${data.task.id} with coordinator ${data.coordinator.id} and implementer ${data.implementer.id}.`,
      );
      setGoal('');
      setTitle('');
      setScope('');
      setAcceptanceText('');
      setVerificationText('');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to start orchestration.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
      <section className="rounded-lg border p-4">
        <h3 className="text-base font-semibold">Start Orchestration</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe the goal, then Team AI will create and delegate the first task.
        </p>

        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Goal</span>
            <textarea
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-foreground"
              placeholder="Implement project orchestration dashboard and pass API tests"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Title (optional)</span>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-foreground"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Orchestration bootstrap"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Scope (optional)</span>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-foreground"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="backend/api + frontend/projects"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Acceptance Criteria</span>
              <textarea
                className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-foreground"
                value={acceptanceText}
                onChange={(e) => setAcceptanceText(e.target.value)}
                placeholder="One line per criterion"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Verification Commands</span>
              <textarea
                className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-foreground"
                value={verificationText}
                onChange={(e) => setVerificationText(e.target.value)}
                placeholder="One line per command"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Starting...' : 'Start Orchestration'}
          </button>
        </form>

        {resultMessage ? (
          <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {resultMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}
      </section>

      <section className="grid gap-3">
        <ResourceListCard
          title="Agents"
          subtitle={`${agentsState.collection.length} total`}
          emptyText="No agents found."
          rows={agentsState.collection.map((agentState) => ({
            key: agentState.data.id,
            title: `${agentState.data.name} · ${agentState.data.role}`,
            meta: `status: ${agentState.data.status}`,
          }))}
        />

        <ResourceListCard
          title="Tasks"
          subtitle={`${tasksState.collection.length} total`}
          emptyText="No tasks found."
          rows={tasksState.collection.map((taskState) => ({
            key: taskState.data.id,
            title: `${taskState.data.id} · ${taskState.data.title}`,
            meta: `status: ${taskState.data.status}`,
          }))}
        />

        <ResourceListCard
          title="Events"
          subtitle={`${events.length} recent`}
          emptyText="No events found."
          rows={events.map((eventState) => ({
            key: eventState.data.id,
            title: `${eventState.data.type} · ${eventState.data.agent?.id ?? 'system'}`,
            meta: `${formatTimestamp(eventState.data.occurredAt)} · ${eventState.data.message ?? 'no message'}`,
          }))}
        />
      </section>
    </div>
  );
}

function ResourceListCard(props: {
  title: string;
  subtitle: string;
  emptyText: string;
  rows: Array<{
    key: string;
    title: string;
    meta: string;
  }>;
}) {
  const { title, subtitle, emptyText, rows } = props;

  return (
    <article className="rounded-lg border p-4">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-sm font-medium">{row.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{row.meta}</p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function MissingPanelMessage(props: { message: string }) {
  return (
    <div className="flex h-[360px] items-center justify-center rounded-md border text-sm text-muted-foreground">
      {props.message}
    </div>
  );
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

      const GraphConstructor = g6.Graph as unknown as new (
        options: object,
      ) => G6GraphInstance;
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
    <div>
      <div className="mb-4 flex flex-col gap-1">
        <h3 className="text-lg font-semibold">Knowledge Graph</h3>
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
        <h4 className="text-sm font-semibold">Relations</h4>
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

function normalizeOptionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toStringList(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export default FeaturesProjects;
