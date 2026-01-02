import { Conversation, User } from '@shared/schema';
import { Resource, State } from '@hateoas-ts/resource';
import { Divider, Spin, theme } from 'antd';
import { Conversations } from '@ant-design/x';
import { useInfiniteCollection } from '@hateoas-ts/resource-react';
import { useMemo } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { RedoOutlined } from '@ant-design/icons';

interface Props {
  resource: Resource<User>;
  onConversationChange: (conversationState: State<Conversation>) => void;
}

export function UserConversations(props: Props) {
  const { resource, onConversationChange } = props;
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

  const {
    items: conversationCollection,
    hasNextPage,
    loadNextPage,
  } = useInfiniteCollection(conversationsResource);

  const items = useMemo(
    () =>
      conversationCollection.map((conv) => ({
        key: conv.data.id,
        label: conv.data.title,
      })),
    [conversationCollection],
  );

  return (
    <div id="scrollableDiv" className="h-full overflow-auto">
      <InfiniteScroll
        next={loadNextPage}
        hasMore={hasNextPage}
        loader={
          <div style={{ textAlign: 'center' }}>
            <Spin indicator={<RedoOutlined spin />} size="small" />
          </div>
        }
        endMessage={<Divider plain>It is all, nothing more</Divider>}
        scrollableTarget="scrollableDiv"
        dataLength={items.length}
        style={{ overflow: 'hidden' }}
      >
        <Conversations
          items={items}
          style={style}
          onActiveChange={(value) => {
            const res = conversationCollection.find(
              (conv) => conv.data.id === value,
            );
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            onConversationChange(res!);
          }}
        />
      </InfiniteScroll>
    </div>
  );
}

export default UserConversations;
