import { ConversationLegacy, UserLegacy } from '@web/domain';
import { UserConversations } from '../user-conversations/UserConversations';
import { useState } from 'react';
import { Card, Divider, Flex } from 'antd';
import { ConversationMessages } from '../conversation-messages/ConversationMessages';

export function Chat(props: { user: UserLegacy }) {
  const [activeConversation, setActiveConversation] = useState<ConversationLegacy>();
  const onConversationChange = (conversation: ConversationLegacy) => {
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
