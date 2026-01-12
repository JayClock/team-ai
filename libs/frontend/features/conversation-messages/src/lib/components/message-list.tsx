import { UIMessage, useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Conversation } from '@shared/schema';
import { State } from '@hateoas-ts/resource-react';
import {
  Conversation as ConversationWrapper,
  ConversationContent,
  Message,
  MessageContent,
  MessageResponse,
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@shared/ui';
import { useState } from 'react';

interface MessageListProps {
  defaultMessages: UIMessage[];
  conversationState: State<Conversation>;
}

export function MessageList({
  defaultMessages,
  conversationState,
}: MessageListProps) {
  const { messages, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: conversationState.getLink('send-message')?.href,
      prepareSendMessagesRequest: ({ messages }) => {
        const lastMessage = messages.at(-1);
        return {
          body: {
            role: lastMessage?.role,
            content: lastMessage?.parts[0].text,
          },
        };
      },
    }),
    messages: defaultMessages,
  });

  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async ({ text }: { text: string }) => {
    if (!text.trim() || isLoading) return;
    setIsLoading(true);
    await sendMessage({ text });
    setIsLoading(false);
  };

  return (
    <ConversationWrapper>
      <ConversationContent>
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
      </ConversationContent>
      <div className="border-t bg-background p-4">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputSubmit status={isLoading ? 'submitted' : undefined} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </ConversationWrapper>
  );
}
