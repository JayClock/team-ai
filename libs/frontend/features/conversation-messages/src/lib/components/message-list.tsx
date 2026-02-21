import { UIMessage, useChat } from '@ai-sdk/react';
import { Conversation } from '@shared/schema';
import { State } from '@hateoas-ts/resource';
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
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputAttachments,
  PromptInputAttachment,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  PromptInputTools,
  Suggestions,
  Suggestion,
} from '@shared/ui';
import { useState } from 'react';
import { StandardSseChatTransport } from './standard-sse-chat-transport';
import { type Signal } from '@preact/signals-react';

interface MessageListProps {
  defaultMessages: UIMessage[];
  conversationState: Signal<State<Conversation>>;
}

const defaultSuggestions = [
  '帮我写一篇技术文档',
  '解释一下什么是 HATEOAS',
  '如何优化 React 性能？',
  '给我一些代码审查建议',
];

const API_KEY_STORAGE_KEY = 'api-key';
const MODEL_STORAGE_KEY = 'ai-model';
const API_KEY_HEADER = 'X-Api-Key';
const MODEL_HEADER = 'X-AI-Model';

function withApiKeyInterceptor(fetcher: typeof fetch = fetch) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    const model = localStorage.getItem(MODEL_STORAGE_KEY);

    if (!apiKey && !model) {
      return fetcher(input, init);
    }

    const requestWithApiKey = new Request(input, init);
    if (apiKey) {
      requestWithApiKey.headers.set(API_KEY_HEADER, apiKey);
    }
    if (model) {
      requestWithApiKey.headers.set(MODEL_HEADER, model);
    }
    return fetcher(requestWithApiKey);
  };
}

export function MessageList({
  defaultMessages,
  conversationState,
}: MessageListProps) {
  const currentConversationState = conversationState.value;
  const { messages, sendMessage } = useChat({
    transport: new StandardSseChatTransport({
      api: currentConversationState.getLink('chat')?.href,
      fetch: withApiKeyInterceptor(),
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

  const handleSuggestionClick = async (suggestion: string) => {
    if (isLoading) return;
    setIsLoading(true);
    await sendMessage({ text: suggestion });
    setIsLoading(false);
  };

  const showSuggestions = messages.length === 0;

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

      <div className="shrink-0 border-t border-border bg-background/95 p-4 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto max-w-3xl space-y-4">
          {showSuggestions && (
            <Suggestions className="justify-center">
              {defaultSuggestions.map((suggestion) => (
                <Suggestion
                  key={suggestion}
                  suggestion={suggestion}
                  onClick={handleSuggestionClick}
                />
              ))}
            </Suggestions>
          )}

          <PromptInput onSubmit={handleSubmit} multiple accept="image/*">
            <PromptInputHeader>
              <PromptInputAttachments>
                {(attachment) => <PromptInputAttachment data={attachment} />}
              </PromptInputAttachments>
            </PromptInputHeader>
            <PromptInputBody className="rounded-xl border border-input bg-background shadow-sm transition-all duration-200 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <PromptInputTextarea
                placeholder="输入消息..."
                className="min-h-15 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                aria-label="输入消息内容"
              />
            </PromptInputBody>
            <PromptInputFooter className="mt-2 flex items-center justify-between">
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments label="添加图片或文件" />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
              </PromptInputTools>
              <PromptInputSubmit
                status={isLoading ? 'submitted' : undefined}
                className="transition-opacity duration-200 hover:opacity-90"
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
