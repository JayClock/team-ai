import { Message, MessageContent } from '@shared/ui';
import { ReasoningPart } from './conversation-part-reasoning';
import {
  isRenderableTerminalPart,
  TerminalPart,
} from './conversation-part-terminal';
import { TextPart } from './conversation-part-text';
import { isRenderableToolPart, ToolPart } from './conversation-part-tool';
import type { SessionEventChatMessage } from './session-events.types';

type SessionEventMessageProps = {
  message: SessionEventChatMessage;
};

export function SessionEventMessage(props: SessionEventMessageProps) {
  const { message } = props;
  const isSystem = message.role === 'system';
  const isThought = message.parts.every((part) => part.type === 'reasoning');
  const isPending = message.metadata?.pending === true;

  return (
    <Message
      from={message.role === 'user' ? 'user' : 'assistant'}
      className={
        isSystem
          ? 'mx-auto max-w-2xl'
          : isThought
            ? 'opacity-85'
            : undefined
      }
    >
      <MessageContent
        className={
          isSystem
            ? 'mx-auto rounded-full border bg-muted/50 px-3 py-2 text-xs text-muted-foreground'
            : undefined
        }
      >
        {message.parts.map((part, index) => {
          if (part.type === 'reasoning') {
            return (
              <ReasoningPart
                key={`${message.id}-${index}`}
                part={part}
                defaultOpen={isThought}
                index={index}
                messageId={message.id}
              />
            );
          }

          if (isRenderableToolPart(part)) {
            return (
              <ToolPart
                key={`${message.id}-${index}`}
                part={part}
                index={index}
                messageId={message.id}
              />
            );
          }

          if (isRenderableTerminalPart(part)) {
            return (
              <TerminalPart
                key={`${message.id}-${index}`}
                part={part}
                index={index}
                messageId={message.id}
              />
            );
          }

          if (part.type === 'text') {
            return (
              <TextPart
                key={`${message.id}-${index}`}
                part={part}
                isPending={isPending}
                index={index}
                messageId={message.id}
              />
            );
          }

          return null;
        })}
      </MessageContent>
    </Message>
  );
}
