import { UIMessage, useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Conversation } from '@shared/schema';
import { State } from '@hateoas-ts/resource-react';
import { Message, MessageContent, MessageResponse } from '@shared/ui';

interface MessageListProps {
  defaultMessages: UIMessage[];
  conversationState: State<Conversation>;
}

export function MessageList({
  defaultMessages,
  conversationState,
}: MessageListProps) {
  const { messages } = useChat({
    transport: new DefaultChatTransport({
      api: conversationState.getLink('send-message')?.href,
    }),
    messages: defaultMessages,
  });

  return (
    <div>
      {messages.map((message) => (
        <Message from={message.role} key={message.id}>
          <MessageContent>
            {message.parts.map((part, i) => {
              switch (part.type) {
                case 'text':
                  return (
                    <MessageResponse key={`${message.id}-${i}`}>
                      {part.text}
                    </MessageResponse>
                  );
                default:
                  return null;
              }
            })}
          </MessageContent>
        </Message>
      ))}
    </div>
  );
}
