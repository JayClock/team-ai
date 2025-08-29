import { Conversation, User } from '@web/domain';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { GetProp } from 'antd';
import { ConversationsProps } from '@ant-design/x';

export const useUserConversations = (
  user: User,
  activeConversationId: string
) => {
  const { data, hasNextPage, fetchNextPage, isPending, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['userConversations', user.getIdentity()],
      queryFn: async ({ pageParam, signal }) => {
        return await pageParam(signal);
      },
      initialPageParam: async (signal: AbortSignal) =>
        await user.getConversations().findAll({ signal }),
      getNextPageParam: (lastPage) => {
        if (lastPage.hasNext()) {
          return (signal: AbortSignal) => lastPage.fetchNext({ signal });
        }
        return undefined;
      },
    });

  const list = useMemo(() => {
    let res: Conversation[] = [];
    data?.pages.forEach(({ items }) => {
      res = [...res, ...items()];
    });
    return res;
  }, [data]);

  const activeConversation = useMemo(() => {
    return list.find((c) => c.getIdentity() === activeConversationId);
  }, [list, activeConversationId]);

  const conversationItems = useMemo<
    GetProp<ConversationsProps, 'items'>
  >(() => {
    return list.map((conversation) => ({
      key: conversation.getIdentity(),
      label: conversation.getDescription().title,
    }));
  }, [list]);

  return {
    hasNextPage,
    fetchNextPage,
    conversationItems,
    activeConversation,
    isPending,
    isFetchingNextPage,
  };
};
