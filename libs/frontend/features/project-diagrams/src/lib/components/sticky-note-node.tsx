import { Node, NodeProps, Handle, Position } from '@xyflow/react';

type StickyNoteNodeData = {
  content: string;
  localData?: Record<string, unknown>;
};

type StickyNoteNodeType = Node<StickyNoteNodeData, 'sticky-note'>;

export function StickyNoteNode({ data }: NodeProps<StickyNoteNodeType>) {
  return (
    <div className="bg-yellow-100 border-l-4 border-yellow-400 shadow-md rounded-r p-3 min-w-[150px]">
      <Handle type="target" position={Position.Top} />
      <div className="text-sm text-gray-800 whitespace-pre-wrap">
        {data.content}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
