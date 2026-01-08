import { UIMessage } from '@ai-sdk/react';
import { Conversation } from '@shared/schema';
import { State, useInfiniteCollection } from '@hateoas-ts/resource-react';
import { useMemo } from 'react';
import { MessageList } from './message-list';

interface ConversationMessagesInnerProps {
  conversationState: State<Conversation>;
}

export function ConversationMessagesInner({
  conversationState,
}: ConversationMessagesInnerProps) {
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
    />
  );
}
