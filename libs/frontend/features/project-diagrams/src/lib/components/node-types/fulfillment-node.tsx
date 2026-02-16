import { DiagramNode } from '@shared/schema';
import { Node, NodeProps, Handle, Position } from '@xyflow/react';

type FulfillmentNodeData = Omit<DiagramNode['data'], 'localData'> & {
  localData: Record<string, unknown> | null;
};

type FulfillmentNodeType = Node<FulfillmentNodeData, 'fulfillment-node'>;

function getNodeColor(type: string): string {
  switch (type) {
    case 'Evidence':
    case 'EVIDENCE':
      return 'bg-pink-100 border-pink-300';
    case 'Role':
    case 'ROLE':
      return 'bg-yellow-100 border-yellow-300';
    case 'Participant':
    case 'PARTICIPANT':
      return 'bg-green-100 border-green-300';
    case 'Context':
    case 'CONTEXT':
      return 'bg-blue-100 border-blue-300';
    default:
      return 'bg-white border-gray-200';
  }
}

function getNodeIcon(type: string): string {
  switch (type) {
    case 'Evidence':
    case 'EVIDENCE':
      return '📄';
    case 'Role':
    case 'ROLE':
      return '🎭';
    case 'Participant':
    case 'PARTICIPANT':
      return '👤';
    case 'Context':
    case 'CONTEXT':
      return '📦';
    default:
      return '📌';
  }
}

export function FulfillmentNode({ data }: NodeProps<FulfillmentNodeType>) {
  const entity = data.localData;
  const entityType = (entity?.type as string | undefined) ?? undefined;
  const entityLabel = (entity?.label as string | undefined) ?? 'Unnamed Entity';
  const entitySubType = (entity?.subType as string | undefined) ?? undefined;
  const bgColorClass = entityType
    ? getNodeColor(entityType)
    : 'bg-white border-gray-200';
  const icon = entityType ? getNodeIcon(entityType) : '📌';

  return (
    <div
      className={`rounded-lg px-4 py-3 shadow-md border-2 min-w-[120px] ${bgColorClass}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <div className="font-semibold text-sm">{entityLabel}</div>
      </div>
      <div className="text-xs text-gray-600 bg-white/50 rounded px-2 py-1 inline-block">
        {entityType ?? data.type}
      </div>
      {entitySubType ? (
        <div className="text-xs text-gray-500 mt-1">{entitySubType}</div>
      ) : null}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
