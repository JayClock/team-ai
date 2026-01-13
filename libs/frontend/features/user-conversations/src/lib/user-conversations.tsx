import { Conversation, User } from '@shared/schema';
import { Resource, State } from '@hateoas-ts/resource';
import { useInfiniteCollection } from '@hateoas-ts/resource-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { ScrollArea, Separator, Spinner } from '@shared/ui';
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
    loading: isLoading,
  } = useInfiniteCollection(conversationsResource);

  const items = useMemo(
    () =>
      conversationCollection.map((conv) => ({
        id: conv.data.id,
        title: conv.data.title,
      })),
    [conversationCollection],
  );

  const loadingRef = useRef(false);

  const { ref: loadMoreRef } = useInView({
    threshold: 0,
    skip: isLoading,
    onChange: (inView) => {
      if (inView && hasNextPage && !loadingRef.current) {
        loadingRef.current = true;
        loadNextPage().finally(() => {
          loadingRef.current = false;
        });
      }
    },
  });

  const handleConversationClick = useCallback(
    (conversationId: string) => {
      setActiveConversationId(conversationId);
      const res = conversationCollection.find(
        (conv) => conv.data.id === conversationId,
      );
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      onConversationChange(res!);
    },
    [conversationCollection, onConversationChange],
  );

  return (
    <ScrollArea className="h-full bg-white">
      <div className="w-[320px]">
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

        {/* Sentinel element for intersection observer */}
        <div ref={loadMoreRef} className="h-1" />

        {isLoading && (
          <div className="flex justify-center py-4">
            <Spinner className="h-4 w-4" />
          </div>
        )}

        {!hasNextPage && items.length > 0 && (
          <div className="flex items-center py-4">
            <Separator
              className="text-xs text-gray-400"
              data-text="没有更多对话了"
            />
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

export default UserConversations;
