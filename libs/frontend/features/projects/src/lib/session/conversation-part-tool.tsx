import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@shared/ui';
import type { DynamicToolUIPart, ToolUIPart } from 'ai';
import type { SessionChatMessage } from './use-project-session-chat';

type RenderableToolPart = DynamicToolUIPart | ToolUIPart;

export function isRenderableToolPart(
  part: SessionChatMessage['parts'][number],
): part is RenderableToolPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

interface ToolPartProps {
  part: RenderableToolPart;
  index: number;
  messageId: string;
}

export function ToolPart({ part, index, messageId }: ToolPartProps) {
  return (
    <Tool
      key={`${messageId}-${index}`}
      defaultOpen={
        part.state === 'output-available' || part.state === 'output-error'
      }
    >
      {part.type === 'dynamic-tool' ? (
        <ToolHeader
          title={part.title}
          type={part.type}
          state={part.state}
          toolName={part.toolName}
        />
      ) : (
        <ToolHeader
          title={'title' in part ? part.title : undefined}
          type={part.type}
          state={part.state}
        />
      )}
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput
          errorText={'errorText' in part ? part.errorText : undefined}
          output={'output' in part ? part.output : undefined}
        />
      </ToolContent>
    </Tool>
  );
}
