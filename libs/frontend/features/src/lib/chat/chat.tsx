import { User } from '@web/domain';
import { Conversations, ConversationsProps } from '@ant-design/x';
import { Flex, GetProp, Spin, theme } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ConversationMessages } from './components/conversation-messages';

export function Chat(props: { user: User }) {
  const { user } = props;
  const [activeConversationId, setActiveConversationId] = useState<string>();

  const { token } = theme.useToken();

  const style = {
    width: 256,
    background: token.colorBgContainer,
    borderRadius: token.borderRadius,
  };

  const { data: conversations, isPending } = useQuery({
    queryKey: ['userConversations', user.getIdentity()],
    queryFn: () => user.getConversations().fetchFirst(),
  });

  const activeConversation = useMemo(() => {
    return conversations?.items().find(
      (c) => c.getIdentity() === activeConversationId
    );
  }, [conversations, activeConversationId]);

  const conversationItems: GetProp<ConversationsProps, 'items'> =
    useMemo(() => {
      if (!conversations?.items()) {
        return [];
      }
      return conversations.items().map((conversation) => ({
        key: conversation.getIdentity(),
        label: conversation.getDescription().title,
      }));
    }, [conversations]);

  return (
    <Flex gap="small">
      <Flex vertical>
        <div>Chat {props.user.getDescription().name}</div>
        {isPending ? (
          <Spin />
        ) : (
          <Conversations
            items={conversationItems}
            style={style}
            onActiveChange={setActiveConversationId}
          />
        )}
      </Flex>
      {activeConversation && (
        <ConversationMessages conversation={activeConversation} />
      )}
    </Flex>
  );
}
