import { UIMessage, useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Conversation } from '@shared/schema';
import { State } from '@hateoas-ts/resource-react';
import {
  Conversation as ConversationWrapper,
  ConversationContent,
  ConversationScrollButton,
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
        const textPart = lastMessage?.parts.find((p) => p.type === 'text');
        return {
          body: {
            role: lastMessage?.role,
            content: textPart && 'text' in textPart ? textPart.text : '',
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
    <div className="flex h-full flex-col bg-background">
      <ConversationWrapper className="relative flex-1 overflow-hidden">
        <ConversationContent className="gap-6 px-4 py-6 md:px-6">
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
        <ConversationScrollButton />
      </ConversationWrapper>
      <div className="shrink-0 border-t border-border bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-3xl">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody className="rounded-xl border border-input bg-background shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <PromptInputTextarea
                placeholder="Type a message..."
                className="min-h-[60px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </PromptInputBody>
            <PromptInputFooter className="mt-2 flex items-center justify-end">
              <PromptInputSubmit
                status={isLoading ? 'submitted' : undefined}
                className="transition-all hover:scale-105"
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
