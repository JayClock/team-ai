import { Conversation } from '@shared/schema';
import { State } from '@hateoas-ts/resource-react';
import { ConversationMessagesInner } from './components';
import { ConversationEmptyState } from '@shared/ui';

export function ConversationMessages(props: {
  conversationState?: State<Conversation>;
}) {
  const { conversationState } = props;

  if (!conversationState) {
    return <ConversationEmptyState />;
  }

  return <ConversationMessagesInner conversationState={conversationState} />;
}

export default ConversationMessages;
