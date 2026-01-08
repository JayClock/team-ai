import { Conversation } from '@shared/schema';
import { State } from '@hateoas-ts/resource-react';
import { ConversationMessagesInner, EmptyState } from './components';

export function ConversationMessages(props: {
  conversationState?: State<Conversation>;
}) {
  const { conversationState } = props;

  if (!conversationState) {
    return <EmptyState />;
  }

  return (
    <div className="h-full">
      <ConversationMessagesInner conversationState={conversationState} />
    </div>
  );
}

export default ConversationMessages;
