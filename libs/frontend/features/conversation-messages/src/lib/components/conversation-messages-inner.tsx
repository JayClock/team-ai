import { UIMessage } from '@ai-sdk/react';
import { Conversation } from '@shared/schema';
import { State } from '@hateoas-ts/resource';
import { useSuspenseInfiniteCollection } from '@hateoas-ts/resource-react';
import { useMemo } from 'react';
import { MessageList } from './message-list';
import { type Signal } from '@preact/signals-react';

interface ConversationMessagesInnerProps {
  conversationState: Signal<State<Conversation>>;
}

export function ConversationMessagesInner({
  conversationState,
}: ConversationMessagesInnerProps) {
  const currentConversationState = conversationState.value;
  const messagesResource = currentConversationState.follow('messages');

  const { items: messagesCollections } =
    useSuspenseInfiniteCollection(messagesResource);

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
