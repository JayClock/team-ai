import { Conversation, User } from '@web/domain';
import { UserConversations } from '../user-conversations/UserConversations';
import { useState } from 'react';
import { Card, Divider, Flex } from 'antd';
import { ConversationMessages } from '../conversation-messages/ConversationMessages';

export function Chat(props: { user: User }) {
  const [activeConversation, setActiveConversation] = useState<Conversation>();
  const onConversationChange = (conversation: Conversation) => {
    setActiveConversation(conversation);
  };
  return (
    <Card>
      <Flex style={{ height: 500 }} gap={12}>
        <UserConversations
          user={props.user}
          onConversationChange={onConversationChange}
        />
        <Divider type="vertical" style={{ height: '100%' }}></Divider>
        {activeConversation && (
          <ConversationMessages
            key={activeConversation.getIdentity()}
            conversation={activeConversation}
          />
        )}
      </Flex>
    </Card>
  );
}
