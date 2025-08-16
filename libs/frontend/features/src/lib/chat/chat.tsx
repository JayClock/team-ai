import { User } from '@web/domain';
import { Conversations, ConversationsProps } from '@ant-design/x';
import { GetProp, Spin, theme } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

export function Chat(props: { user: User }) {
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
    <div className="flex">
      <div className="flex flex-col">
        <div>Chat {props.user.getDescription().name}</div>
        {isPending ? (
          <Spin />
        ) : (
          <Conversations items={conversationItems} style={style} />
        )}
      </div>
    </div>
  );
}
