import { User } from '@web/domain';
import { Conversation, Conversations, ConversationsProps } from '@ant-design/x';
import { Flex, GetProp, Spin, theme } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ConversationMessages } from './components/conversation-messages';

export function Chat(props: { user: User }) {
  const [conversation, setConversation] = useState<Conversation>();

  const { token } = theme.useToken();

  const style = {
    width: 256,
    background: token.colorBgContainer,
    borderRadius: token.borderRadius,
  };

  const { data, isPending } = useQuery({
    queryKey: ['userConversations'],
    queryFn: () => props.user.getConversations().fetchFirst(),
  });

  const conversationItems: GetProp<ConversationsProps, 'items'> =
    useMemo(() => {
      if (!data?.items) {
        return [];
      }
      return data.items.map((conversation) => ({
        key: conversation.getIdentity(),
        label: conversation.getDescription().title,
      }));
    }, [data?.items]);

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
            onActiveChange={(value) => {
              setConversation(
                conversationItems.find((item) => item.key === value)
              );
            }}
          />
        )}
      </Flex>
      {conversation ? (
        <ConversationMessages conversation={conversation} />
      ) : (
        <div />
      )}
    </Flex>
  );
}
