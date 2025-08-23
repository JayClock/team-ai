import { User } from '@web/domain';
import { Conversations, ConversationsProps } from '@ant-design/x';
import { Flex, GetProp, Spin, theme } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { ConversationMessages } from './components/conversation-messages';
import { useComputed, useSignal } from '@preact-signals/safe-react';

export function Chat(props: { user: User }) {
  const { user } = props;
  const conversations = user.getConversations();
  const activeConversationId = useSignal('');

  const { token } = theme.useToken();

  const style = {
    width: 256,
    background: token.colorBgContainer,
    borderRadius: token.borderRadius,
  };

  const { data, isPending } = useQuery({
    queryKey: ['userConversations', user.getIdentity()],
    queryFn: async () => {
      await conversations.fetchFirst();
      return conversations.items();
    },
    initialData: [],
  });

  const activeConversation = useComputed(() =>
    data.find((c) => c.getIdentity() === activeConversationId.value)
  );

  const conversationItems = useComputed<GetProp<ConversationsProps, 'items'>>(
    () => {
      return data.map((conversation) => ({
        key: conversation.getIdentity(),
        label: conversation.getDescription().title,
      }));
    }
  );

  return (
    <Flex gap="small">
      <Flex vertical>
        <div>
          Chat {props.user.getDescription().name} {activeConversationId.value}
        </div>
        {isPending ? (
          <Spin />
        ) : (
          <Conversations
            items={conversationItems.value}
            style={style}
            onActiveChange={(id) => (activeConversationId.value = id)}
          />
        )}
      </Flex>
      {activeConversation.value && (
        <ConversationMessages conversation={activeConversation.value} />
      )}
    </Flex>
  );
}
