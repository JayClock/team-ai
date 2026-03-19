import { Reasoning, ReasoningContent, ReasoningTrigger } from '@shared/ui';
import type { SessionEventChatMessage } from './session-events.types';

interface ReasoningPartProps {
  part: Extract<SessionEventChatMessage['parts'][number], { type: 'reasoning' }>;
  defaultOpen: boolean;
  index: number;
  messageId: string;
}

export function ReasoningPart({
  part,
  defaultOpen,
  index,
  messageId,
}: ReasoningPartProps) {
  return (
    <Reasoning key={`${messageId}-${index}`} defaultOpen={defaultOpen}>
      <ReasoningTrigger />
      <ReasoningContent>{part.text}</ReasoningContent>
    </Reasoning>
  );
}
