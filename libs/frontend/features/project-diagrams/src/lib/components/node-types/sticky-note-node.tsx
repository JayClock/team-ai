import { DiagramNode } from '@shared/schema';
import { Node, NodeProps, Handle, Position } from '@xyflow/react';

type StickyNoteNodeData = DiagramNode['data'] & {
  content?: string;
  localdata?: Record<string, unknown> | null;
};

type StickyNoteNodeType = Node<StickyNoteNodeData, 'sticky-note'>;

export function StickyNoteNode({ data }: NodeProps<StickyNoteNodeType>) {
  const localContent = data.localData?.content;
  const label = data.localdata?.label;
  const type = data.localdata?.type;
  const entityContent =
    typeof label === 'string' && typeof type === 'string'
      ? `${label} (${type})`
      : undefined;
  const content =
    typeof localContent === 'string'
      ? localContent
      : (entityContent ?? data.content ?? '');

  return (
    <div className="bg-yellow-100 border-l-4 border-yellow-400 shadow-md rounded-r p-3 min-w-[150px]">
      <Handle type="target" position={Position.Top} />
      <div className="text-sm text-gray-800 whitespace-pre-wrap">
        {content}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
