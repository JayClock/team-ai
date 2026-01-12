import { Conversation, User } from '@shared/schema';
import { Resource, State } from '@hateoas-ts/resource';
import { useInfiniteCollection } from '@hateoas-ts/resource-react';
import { useMemo, useState } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { Separator, Spinner } from '@shared/ui';
import { clsx } from 'clsx';

interface Props {
  resource: Resource<User>;
  onConversationChange: (conversationState: State<Conversation>) => void;
}

export function UserConversations(props: Props) {
  const { resource, onConversationChange } = props;
  const [activeConversationId, setActiveConversationId] = useState<string>();

  const conversationsResource = useMemo(
    () => resource?.follow('conversations'),
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
        id: conv.data.id,
        title: conv.data.title,
      })),
    [conversationCollection],
  );

  const handleConversationClick = (conversationId: string) => {
    setActiveConversationId(conversationId);
    const res = conversationCollection.find(
      (conv) => conv.data.id === conversationId,
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    onConversationChange(res!);
  };

  return (
    <div id="scrollableDiv" className="h-full overflow-auto bg-white">
      <InfiniteScroll
        next={loadNextPage}
        hasMore={hasNextPage}
        loader={
          <div className="flex justify-center py-4">
            <Spinner className="h-4 w-4" />
          </div>
        }
        endMessage={
          <div className="flex items-center py-4">
            <Separator
              className="text-xs text-gray-400"
              data-text="没有更多对话了"
            />
          </div>
        }
        scrollableTarget="scrollableDiv"
        dataLength={items.length}
        style={{ overflow: 'hidden' }}
      >
        <div className="w-[320px] h-full">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => handleConversationClick(item.id)}
              className={clsx(
                'w-full px-4 py-3 text-left border-b border-gray-100 hover:bg-gray-50 transition-colors',
                activeConversationId === item.id && 'bg-blue-50',
              )}
            >
              <div className="text-sm font-medium text-gray-900 truncate">
                {item.title}
              </div>
            </button>
          ))}
        </div>
      </InfiniteScroll>
    </div>
  );
}

export default UserConversations;
