import { ConversationLegacy, UserLegacy } from '@web/domain';
import { useUserConversations } from './useUserConversations';
import { useEffect, useState } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { Spin, theme } from 'antd';
import { RedoOutlined } from '@ant-design/icons';
import { Conversations } from '@ant-design/x';

export const UserConversations = (props: {
  user: UserLegacy;
  onConversationChange: (conversation: ConversationLegacy) => void;
}) => {
  const { user, onConversationChange } = props;

  const { token } = theme.useToken();
  const style = {
    width: 256,
    background: token.colorBgContainer,
    borderRadius: token.borderRadius,
  };

  const [activeConversationId, setActiveConversationId] = useState('');

  const { conversationItems, activeConversation, fetchNextPage, hasNextPage } =
    useUserConversations(user, activeConversationId);

  useEffect(() => {
    activeConversation && onConversationChange(activeConversation);
  }, [activeConversation, onConversationChange]);

  useEffect(() => {
    if (conversationItems.length !== 0 && !activeConversationId) {
      setActiveConversationId(conversationItems[0].key);
    }
  }, [conversationItems, activeConversationId]);

  return (
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
          activeKey={activeConversationId}
          items={conversationItems}
          onActiveChange={setActiveConversationId}
          style={style}
        ></Conversations>
      </InfiniteScroll>
    </div>
  );
};
