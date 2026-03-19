import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@shared/ui';
import type { DynamicToolUIPart, ToolUIPart } from 'ai';
import type { SessionEventChatMessage } from './session-events.types';
import {
  asRecord,
  inferToolDisplayName,
  normalizeErrorText,
  normalizeToolValue,
} from './tool-data';

type RenderableToolPart = DynamicToolUIPart | ToolUIPart;

function getStaticToolName(part: ToolUIPart): string {
  return part.type.split('-').slice(1).join('-');
}

function getPartTitle(part: RenderableToolPart): string | undefined {
  return 'title' in part && typeof part.title === 'string' && part.title.trim()
    ? part.title
    : undefined;
}

function normalizeToolPart(part: RenderableToolPart) {
  const normalizedInput = normalizeToolValue(part.input);
  const inputRecord = asRecord(normalizedInput);
  const fallbackName =
    part.type === 'dynamic-tool' ? part.toolName : getStaticToolName(part);
  const displayName = inferToolDisplayName(
    getPartTitle(part) ?? fallbackName,
    fallbackName,
    inputRecord,
  );

  return {
    displayName,
    errorText:
      'errorText' in part ? normalizeErrorText(part.errorText) : undefined,
    output: 'output' in part ? normalizeToolValue(part.output) : undefined,
    toolName: fallbackName,
    input: normalizedInput,
  };
}

export function isRenderableToolPart(
  part: SessionEventChatMessage['parts'][number],
): part is RenderableToolPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

interface ToolPartProps {
  part: RenderableToolPart;
  index: number;
  messageId: string;
}

export function ToolPart({ part, index, messageId }: ToolPartProps) {
  const normalized = normalizeToolPart(part);

  return (
    <Tool
      key={`${messageId}-${index}`}
      defaultOpen={
        part.state === 'output-available' || part.state === 'output-error'
      }
    >
      {part.type === 'dynamic-tool' ? (
        <ToolHeader
          title={normalized.displayName}
          type={part.type}
          state={part.state}
          toolName={normalized.toolName}
        />
      ) : (
        <ToolHeader
          title={normalized.displayName}
          type={part.type}
          state={part.state}
        />
      )}
      <ToolContent>
        <ToolInput input={normalized.input} />
        <ToolOutput
          errorText={normalized.errorText}
          output={normalized.output}
        />
      </ToolContent>
    </Tool>
  );
}
