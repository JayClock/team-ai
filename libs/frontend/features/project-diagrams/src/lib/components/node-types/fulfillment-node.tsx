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
import {
  EVIDENCE_SOURCE_HANDLE_RIGHT,
  EVIDENCE_TARGET_HANDLE_LEFT,
} from '../calculate-evidence-edge-handles';
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
      className={`relative h-[80px] w-[160px] overflow-visible rounded-lg border-2 px-3 py-2 shadow-md ${bgColorClass}`}
    >
      <Handle id="default-target" type="target" position={Position.Top} />
      {entityType === 'EVIDENCE' ? (
        <Handle
          id={EVIDENCE_TARGET_HANDLE_LEFT}
          type="target"
          position={Position.Left}
        />
      ) : null}
      {showPartyRoleName ? (
        <div
          className={`absolute top-0 right-0 max-w-[75%] translate-x-1/2 -translate-y-1/2 truncate rounded border px-1.5 py-0.5 text-[10px] text-right text-yellow-900 ${partyRoleBadgeColorClass}`}
        >
          {partyRoleName}
        </div>
      ) : null}
      <div className="flex h-full min-w-0 flex-col gap-1 overflow-hidden">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-lg">{icon}</span>
          <div className="min-w-0 truncate text-sm font-semibold">{entityLabel}</div>
        </div>
        {entitySubType ? (
          <div className="truncate text-xs text-gray-500">{entitySubType}</div>
        ) : null}
      </div>
      <Handle id="default-source" type="source" position={Position.Bottom} />
      {entityType === 'EVIDENCE' ? (
        <Handle
          id={EVIDENCE_SOURCE_HANDLE_RIGHT}
          type="source"
          position={Position.Right}
        />
      ) : null}
    </div>
  );
}
