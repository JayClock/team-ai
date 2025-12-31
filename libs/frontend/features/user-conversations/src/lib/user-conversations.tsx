import { User } from '@shared/schema';
import { Resource } from '@hateoas-ts/resource';
import { useEffect, useState } from 'react';
import { GetProp, theme } from 'antd';
import { Conversations, ConversationsProps } from '@ant-design/x';

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

  const [items, setItems] = useState<GetProp<ConversationsProps, 'items'>>([]);

  useEffect(() => {
    resource
      .follow('conversations')
      .withMethod('GET')
      .request()
      .then((conversationsState) => {
        const res: GetProp<ConversationsProps, 'items'> =
          conversationsState.collection.map((state) => ({
            key: state.data.id,
            label: state.data.title,
          }));
        setItems(res);
      });
  }, [resource]);

  return <Conversations items={items} style={style}></Conversations>;
}

export default UserConversations;
