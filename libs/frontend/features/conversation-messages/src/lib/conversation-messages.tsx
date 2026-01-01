import { Conversation } from '@shared/schema';
import { State, useInfiniteCollection } from '@hateoas-ts/resource-react';
import { useMemo } from 'react';
import { Bubble } from '@ant-design/x';

interface Props {
  conversationState: State<Conversation>;
}

export function ConversationMessages(props: Props) {
  const { conversationState } = props;

  const { items: messagesCollections, loading } = useInfiniteCollection(
    conversationState.follow('messages'),
  );

  const items = useMemo(() => {
    if (!loading) {
      return messagesCollections.map((message) => ({
        key: message.data.id,
        role: message.data.role,
        content: message.data.content,
      }));
    }
    return [];
  }, [loading, messagesCollections]);

  return <Bubble.List items={items}></Bubble.List>;
}

export default ConversationMessages;
