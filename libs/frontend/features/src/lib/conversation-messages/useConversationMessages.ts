import { useXAgent, useXChat, XStream } from '@ant-design/x';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { BubbleDataType } from '@ant-design/x/es/bubble/BubbleList';
import { Conversation } from '@web/domain';

export const useConversationMessages = (conversation: Conversation) => {
  const { data: serverMessages, isLoading: isLoadingHistory } = useQuery({
    queryKey: [],
    queryFn: async ({ signal }) => {
      return conversation.getMessages().findAll({ signal });
    },
    staleTime: 0,
    gcTime: 0,
    enabled: !!conversation,
  });

  const [agent] = useXAgent<string, { message: string }, string>({
    request: async ({ message }, { onSuccess, onUpdate }) => {
      let fullMessage = '';
      const stream = await conversation.sendMessage(message);
      for await (const chunk of XStream({ readableStream: stream })) {
        const newText = chunk.data?.trim() || '';
        fullMessage += newText;
        onUpdate(fullMessage);
      }
      onSuccess([fullMessage]);
    },
  });

  const { onRequest, messages: currentMessagesRaw } = useXChat({ agent });

  const allMessages = useMemo<BubbleDataType[]>(() => {
    const historicalMessages =
      serverMessages?.items().map((item) => ({
        key: item.getIdentity(),
        role: item.getDescription().role,
        content: item.getDescription().content,
      })) ?? [];

    const currentMessages = currentMessagesRaw.map(
      ({ message, status, id }) => ({
        key: id,
        role: status === 'local' ? 'user' : 'assistant',
        content: message,
      })
    );

    return [...historicalMessages, ...currentMessages];
  }, [serverMessages, currentMessagesRaw]);

  const sendMessage = (content: string) => {
    if (!content.trim()) return;
    onRequest({ message: content });
  };
  return {
    messages: allMessages,
    sendMessage,
    agent,
    isLoadingHistory,
  };
};
