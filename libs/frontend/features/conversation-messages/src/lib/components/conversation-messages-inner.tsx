import { UIMessage } from '@ai-sdk/react';
import { Conversation } from '@shared/schema';
import { State, useInfiniteCollection } from '@hateoas-ts/resource-react';
import { useMemo } from 'react';
import { MessageList } from './message-list';
import { MessageListSkeleton } from '@shared/ui';

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
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-hidden">
          <MessageListSkeleton count={4} />
        </div>
        <div className="border-t bg-background p-4">
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <MessageList
      defaultMessages={defaultMessages}
      conversationState={conversationState}
    />
  );
}
