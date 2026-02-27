import { LogicalEntity } from '@shared/schema';
import {
  Node,
  NodeProps,
  Handle,
  Position,
  useEdges,
  useNodes,
} from '@xyflow/react';
import { useMemo } from 'react';
import { resolveEvidencePartyRoleName } from '../resolve-evidence-party-role-names';

type FulfillmentNodeType = Node<LogicalEntity['data'], 'fulfillment-node'>;

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

export function FulfillmentNode({ data, id }: NodeProps<FulfillmentNodeType>) {
  const entityType = data.type;
  const entityLabel = data.label;
  const entitySubType = data.subType;
  const bgColorClass = entityType
    ? getNodeColor(entityType)
    : 'bg-white border-gray-200';
  const icon = entityType ? getNodeIcon(entityType) : '📌';
  const nodes = useNodes<FulfillmentNodeType>();
  const edges = useEdges();
  const partyRoleName = useMemo(
    () =>
      resolveEvidencePartyRoleName({
        edges,
        evidenceNodeId: id,
        nodes,
      }),
    [edges, id, nodes],
  );
  const partyRoleBadgeColorClass = getNodeColor('ROLE');
  const showPartyRoleName =
    entityType === 'EVIDENCE' &&
    entitySubType !== 'contract' &&
    (partyRoleName?.length ?? 0) > 0;

  return (
    <div
      className={`relative rounded-lg px-4 py-3 shadow-md border-2 min-w-[120px] ${bgColorClass}`}
    >
      <Handle type="target" position={Position.Top} />
      {showPartyRoleName ? (
        <div
          className={`absolute top-0 right-0 max-w-[75%] translate-x-1/2 -translate-y-1/2 truncate rounded border px-1.5 py-0.5 text-[10px] text-right text-yellow-900 ${partyRoleBadgeColorClass}`}
        >
          {partyRoleName}
        </div>
      ) : null}
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
