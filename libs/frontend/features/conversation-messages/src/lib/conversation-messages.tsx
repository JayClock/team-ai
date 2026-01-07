import { Conversation } from '@shared/schema';
import { State, useInfiniteCollection } from '@hateoas-ts/resource-react';
import { useMemo } from 'react';
import { UIMessage, useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export function ConversationMessages(props: {
  conversationState?: State<Conversation>;
}) {
  const { conversationState } = props;

  if (!conversationState) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-white">
        <div className="text-center max-w-sm mx-auto px-6">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-10 h-10 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <div className="text-gray-600 text-xl font-medium mb-2">
              选择一个对话
            </div>
            <div className="text-gray-400 text-sm leading-relaxed">
              从左侧列表中选择任意对话开始聊天，或创建新的对话开始交流
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="h-full">
      <ConversationMessagesInner conversationState={conversationState} />
    </div>
  );
}

function ConversationMessagesInner(props: {
  conversationState: State<Conversation>;
}) {
  const { conversationState } = props;

  const { items: messagesCollections, loading } = useInfiniteCollection(
    conversationState.follow('messages'),
  );

  const defaultMessages: UIMessage[] = useMemo(() => {
    if (!loading) {
      return messagesCollections.map((message) => ({
        id: message.data.id,
        role: message.data.role,
        parts: [{ type: 'text', text: message.data.content }],
      }));
    }
    return [];
  }, [loading, messagesCollections]);

  if (loading) {
    return 'loading';
  }
  return (
    <MessageList
      defaultMessages={defaultMessages}
      conversationState={conversationState}
    ></MessageList>
  );
}

export default ConversationMessages;

function MessageList(props: {
  defaultMessages: UIMessage[];
  conversationState: State<Conversation>;
}) {
  const { defaultMessages, conversationState } = props;
  const { messages } = useChat({
    transport: new DefaultChatTransport({
      api: conversationState.getLink('send-message')?.href,
    }),
    messages: defaultMessages,
  });

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) =>
            part.type === 'text' ? <span key={index}>{part.text}</span> : null,
          )}
        </div>
      ))}
    </div>
  );
}
