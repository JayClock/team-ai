import { User } from '@shared/schema';
import { Resource } from '@hateoas-ts/resource';
import { theme } from 'antd';
import { Conversations } from '@ant-design/x';
import { useInfiniteCollection } from '@hateoas-ts/resource-react';
import { useMemo } from 'react';

interface Props {
  resource: Resource<User>;
}

export function UserConversations(props: Props) {
  const { resource } = props;
  const { token } = theme.useToken();

  const style = {
    width: 256,
    background: token.colorBgContainer,
    borderRadius: token.borderRadius,
  };

  const conversationsResource = useMemo(
    () => resource.follow('conversations'),
    [resource],
  );

  const { items: conversationCollection } = useInfiniteCollection(
    conversationsResource,
  );

  const items = useMemo(
    () =>
      conversationCollection.map((conv) => ({
        key: conv.data.id,
        label: conv.data.title,
      })),
    [conversationCollection],
  );

  return <Conversations items={items} style={style}></Conversations>;
}

export default UserConversations;
