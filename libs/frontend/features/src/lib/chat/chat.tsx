import { Conversation, User } from '@web/domain';
import { UserConversations } from '../user-conversations/UserConversations';
import { useState } from 'react';
import { ConversationMessages } from './components/conversation-messages';

export function Chat(props: { user: User }) {
  const [activeConversation, setActiveConversation] = useState<Conversation>();
  const onConversationChange = (conversatin: Conversation) => {
    setActiveConversation(conversatin);
  };
  return (
    <div className="flex gap-4 h-full">
      <div className="flex flex-col">
        <div>Chat {props.user.getDescription().name} </div>
        <UserConversations
          user={props.user}
          onConversationChange={onConversationChange}
        />
      </div>
      {activeConversation && (
        <ConversationMessages
          key={activeConversation.getIdentity()}
          conversation={activeConversation}
        />
      )}
    </div>
  );
}
