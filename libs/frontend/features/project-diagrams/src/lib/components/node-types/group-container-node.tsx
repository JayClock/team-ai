import { LogicalEntity } from '@shared/schema';
import { Node, NodeProps, Handle, Position } from '@xyflow/react';

type GroupContainerNodeType = Node<LogicalEntity['data'], 'group-container'>;

export function GroupContainerNode({
  data,
}: NodeProps<GroupContainerNodeType>) {
  return (
    <div className="h-full w-full box-border rounded-lg border-2 border-dashed border-blue-400 bg-blue-50/30 p-3">
      <Handle type="target" position={Position.Top} />
      <div className="text-xs text-blue-600">{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
