import { State } from '@hateoas-ts/resource';
import { DiagramNode, LogicalEntity, LogicalEntityType } from '@shared/schema';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import { Node, NodeProps, Handle, Position } from '@xyflow/react';
import { Suspense } from 'react';

type FulfillmentNodeData = {
  nodeState: State<DiagramNode>;
};

type FulfillmentNodeType = Node<FulfillmentNodeData, 'fulfillment-node'>;

function getNodeColor(type: LogicalEntityType): string {
  switch (type) {
    case 'Evidence':
      return 'bg-pink-100 border-pink-300';
    case 'Role':
      return 'bg-yellow-100 border-yellow-300';
    case 'Participant':
      return 'bg-green-100 border-green-300';
    case 'Context':
      return 'bg-blue-100 border-blue-300';
    default:
      return 'bg-white border-gray-200';
  }
}

function getNodeIcon(type: LogicalEntityType): string {
  switch (type) {
    case 'Evidence':
      return '📄';
    case 'Role':
      return '🎭';
    case 'Participant':
      return '👤';
    case 'Context':
      return '📦';
    default:
      return '📌';
  }
}

function FulfillmentNodeContent({
  nodeState,
}: {
  nodeState: State<DiagramNode>;
}) {
  const { resourceState: entityState } = useSuspenseResource<LogicalEntity>(
    nodeState.follow('logical-entity'),
  );

  const bgColorClass = getNodeColor(entityState.data.type);
  const icon = getNodeIcon(entityState.data.type);

  return (
    <div
      className={`rounded-lg px-4 py-3 shadow-md border-2 min-w-[120px] ${bgColorClass}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <div className="font-semibold text-sm">{entityState.data.label}</div>
      </div>
      <div className="text-xs text-gray-600 bg-white/50 rounded px-2 py-1 inline-block">
        {entityState.data.type}
      </div>
      {entityState.data.subType && (
        <div className="text-xs text-gray-500 mt-1">
          {entityState.data.subType}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function FulfillmentNode({ data }: NodeProps<FulfillmentNodeType>) {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg px-4 py-3 shadow-md border-2 border-gray-200 min-w-[120px] bg-gray-50 animate-pulse">
          <Handle type="target" position={Position.Top} />
          <div className="h-5 w-20 bg-gray-300 rounded mb-2" />
          <div className="h-3 w-12 bg-gray-200 rounded" />
          <Handle type="source" position={Position.Bottom} />
        </div>
      }
    >
      <FulfillmentNodeContent nodeState={data.nodeState} />
    </Suspense>
  );
}
