import { DiagramNode } from '@shared/schema';
import { Node, NodeProps, Handle, Position } from '@xyflow/react';

type GroupContainerNodeData = DiagramNode['data'];

type GroupContainerNodeType = Node<GroupContainerNodeData, 'group-container'>;

export function GroupContainerNode({
  data,
}: NodeProps<GroupContainerNodeType>) {
  return (
    <div className="border-2 border-dashed border-blue-400 bg-blue-50/30 rounded-lg min-w-[200px] min-h-[100px] p-3">
      <Handle type="target" position={Position.Top} />
      <div className="text-sm font-medium text-blue-700 mb-2">
        Context Group
      </div>
      <div className="text-xs text-blue-600">{data.type}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
