import { UIMessage } from '@ai-sdk/react';
import { Conversation } from '@shared/schema';
import {
  State,
  useSuspenseInfiniteCollection,
} from '@hateoas-ts/resource-react';
import { useMemo } from 'react';
import { MessageList } from './message-list';

interface ConversationMessagesInnerProps {
  conversationState: State<Conversation>;
}

export function ConversationMessagesInner({
  conversationState,
}: ConversationMessagesInnerProps) {
  const { items: messagesCollections } = useSuspenseInfiniteCollection(
    conversationState.follow('messages'),
  );

  const defaultMessages: UIMessage[] = useMemo(() => {
    return messagesCollections.map((message) => ({
      id: message.data.id,
      role: message.data.role,
      parts: [{ type: 'text', text: message.data.content }],
    }));
  }, [messagesCollections]);

  return (
    <MessageList
      defaultMessages={defaultMessages}
      conversationState={conversationState}
    />
  );
}
