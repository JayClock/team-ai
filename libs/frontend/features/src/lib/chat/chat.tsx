import { Conversation, User } from '@web/domain';
import { Conversations, ConversationsProps } from '@ant-design/x';
import { Divider, Flex, GetProp, Spin, theme } from 'antd';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ConversationMessages } from './components/conversation-messages';
import { useMemo, useState } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { RedoOutlined } from '@ant-design/icons';

export function Chat(props: { user: User }) {
  const { user } = props;
  const conversations = user.getConversations();
  const [activeConversationId, setConversationId] = useState('');

  const { token } = theme.useToken();

  const style = {
    width: 256,
    background: token.colorBgContainer,
    borderRadius: token.borderRadius,
  };

  const { data, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['userConversations', user.getIdentity()],
    queryFn: async ({ pageParam }) => {
      await pageParam();
      return {
        items: conversations.items(),
        hasNext: conversations.hasNext(),
      };
    },
    initialPageParam: async () => await conversations.fetchFirst(),
    getNextPageParam: (lastpage) => {
      if (lastpage.hasNext) {
        return async () => await conversations.fetchNext();
      }
      return undefined;
    },
  });

  const list = useMemo(() => {
    let res: Conversation[] = [];
    data?.pages.forEach(({ items }) => {
      res = [...res, ...items];
    });
    return res;
  }, [data]);

  const activeConversation = useMemo(
    () => list.find((c) => c.getIdentity() === activeConversationId),
    [list, activeConversationId]
  );

  const conversationItems = useMemo<
    GetProp<ConversationsProps, 'items'>
  >(() => {
    return list.map((conversation) => ({
      key: conversation.getIdentity(),
      label: conversation.getDescription().title,
    }));
  }, [list]);

  return (
    <Flex gap="small">
      <Flex vertical>
        <div>Chat {props.user.getDescription().name} </div>
        <div id="scrollableDiv">
          <InfiniteScroll
            dataLength={conversationItems.length}
            next={fetchNextPage}
            hasMore={hasNextPage}
            loader={
              <div style={{ textAlign: 'center' }}>
                <Spin indicator={<RedoOutlined spin />} size="small" />
              </div>
            }
            style={{ overflow: 'hidden' }}
            scrollableTarget="scrollableDiv"
          >
            <Conversations
              items={conversationItems}
              onActiveChange={setConversationId}
              style={style}
            ></Conversations>
          </InfiniteScroll>
        </div>
      </Flex>
      {activeConversation && (
        <ConversationMessages conversation={activeConversation} />
      )}
    </Flex>
  );
}
